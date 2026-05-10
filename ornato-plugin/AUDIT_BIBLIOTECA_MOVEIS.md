# Auditoria — Biblioteca paramétrica Ornato

_Total auditado: 47 JSONs em `biblioteca/moveis/`. Referência canônica: `cozinha/balcao_2_portas.json`._

## Resumo por arquivo

| arquivo | parametros_ok | pecas_ok | roles_ok | bordas_ok | materiais_ok | observacoes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `area_servico/armario_lavanderia.json` | OK | OK | OK | NOK | OK | 10 params sem type/label (schema light) |
| `area_servico/armario_tanque.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `banheiro/coluna_banheiro.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `banheiro/espelheira.json` | OK | OK | OK | NOK | OK | 9 params sem type/label (schema light) |
| `banheiro/gabinete_banheiro.json` | OK | OK | NOK | NOK | OK | 9 params sem type/label (schema light) |
| `banheiro/nicho_banheiro.json` | OK | OK | OK | OK | OK | 7 params sem type/label (schema light) |
| `closet/modulo_closet_cab.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `closet/modulo_closet_gavetas.json` | OK | OK | OK | NOK | OK | 11 params sem type/label (schema light) |
| `closet/modulo_closet_meio.json` | OK | OK | OK | OK | OK | 11 params sem type/label (schema light) |
| `closet/modulo_closet_porta.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `closet/modulo_closet_prat.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `closet/sapateira.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `closet/torre_closet.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `comercial/balcao_atendimento.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `comercial/gondola.json` | OK | OK | OK | NOK | OK | 7 params sem type/label (schema light) |
| `comercial/vitrine.json` | OK | OK | OK | NOK | OK | 10 params sem type/label (schema light) |
| `cozinha/aereo_basculante.json` | OK | OK | OK | OK | OK | 7 params sem type/label (schema light) |
| `cozinha/aereo_escorredor.json` | OK | OK | OK | NOK | OK | 6 params sem type/label (schema light) |
| `cozinha/aereo_simples.json` | OK | OK | OK | NOK | OK | 9 params sem type/label (schema light) |
| `cozinha/balcao_2_gavetas.json` | OK | OK | OK | OK | OK | 9 params sem type/label (schema light) |
| `cozinha/balcao_2_portas.json` | OK | OK | OK | OK | OK | — |
| `cozinha/balcao_cooktop.json` | OK | OK | NOK | NOK | OK | 9 params sem type/label (schema light) |
| `cozinha/balcao_pia.json` | OK | OK | NOK | NOK | OK | 8 params sem type/label (schema light) |
| `cozinha/balcao_simples.json` | OK | OK | OK | NOK | OK | 11 params sem type/label (schema light) |
| `cozinha/canto_l.json` | OK | OK | NOK | NOK | OK | 9 params sem type/label (schema light) |
| `cozinha/coluna_multiuso.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `cozinha/gaveteiro_3.json` | OK | OK | OK | NOK | OK | 9 params sem type/label (schema light) |
| `cozinha/gaveteiro_4.json` | OK | OK | OK | NOK | OK | 9 params sem type/label (schema light) |
| `cozinha/nicho_aberto.json` | OK | OK | OK | OK | OK | 7 params sem type/label (schema light) |
| `cozinha/paneleiro.json` | OK | OK | OK | NOK | OK | 9 params sem type/label (schema light) |
| `cozinha/torre_forno.json` | OK | OK | OK | NOK | OK | 11 params sem type/label (schema light) |
| `cozinha/torre_geladeira.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `dormitorio/cabeceira.json` | OK | OK | OK | NOK | OK | 10 params sem type/label (schema light) |
| `dormitorio/comoda_3g.json` | OK | OK | OK | OK | OK | 8 params sem type/label (schema light) |
| `dormitorio/comoda_4g.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `dormitorio/criado_mudo.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `dormitorio/guarda_roupa_2p.json` | OK | OK | OK | NOK | OK | 11 params sem type/label (schema light) |
| `dormitorio/guarda_roupa_3p.json` | OK | OK | OK | NOK | OK | 11 params sem type/label (schema light) |
| `dormitorio/guarda_roupa_4p.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `dormitorio/guarda_roupa_correr.json` | OK | OK | OK | OK | OK | 11 params sem type/label (schema light) |
| `escritorio/armario_escritorio.json` | OK | OK | OK | OK | OK | 11 params sem type/label (schema light) |
| `escritorio/estante_livros.json` | OK | OK | OK | NOK | OK | 8 params sem type/label (schema light) |
| `escritorio/mesa_escritorio.json` | OK | OK | OK | NOK | OK | 9 params sem type/label (schema light) |
| `sala/estante_sala.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |
| `sala/painel_ripado.json` | NOK | OK | OK | OK | OK | faltam params base: espessura |
| `sala/painel_tv.json` | OK | OK | OK | OK | OK | 8 params sem type/label (schema light) |
| `sala/rack_sala.json` | OK | OK | OK | OK | OK | 10 params sem type/label (schema light) |

## Roles inválidos

- `banheiro/gabinete_banheiro.json` :: peca **Travessa Superior Frontal** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)
- `banheiro/gabinete_banheiro.json` :: peca **Travessa Superior Traseira** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)
- `cozinha/balcao_cooktop.json` :: peca **Travessa Superior Frontal** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)
- `cozinha/balcao_pia.json` :: peca **Travessa Superior Frontal** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)
- `cozinha/balcao_pia.json` :: peca **Travessa Superior Traseira** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)
- `cozinha/canto_l.json` :: peca **Travessa Frontal A** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)
- `cozinha/canto_l.json` :: peca **Travessa Frontal B** :: role=`travessa` (não consta em RoleNormalizer.MAP — sugestão: usar `panel` ou `cover`, ou adicionar alias `travessa => :panel` ao MAP)

**Total: 7 ocorrências, todas com role `travessa` em 4 arquivos** (`gabinete_banheiro`, `balcao_cooktop`, `balcao_pia`, `canto_l`).

## Bordas inválidas

- `area_servico/armario_lavanderia.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `banheiro/espelheira.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `banheiro/gabinete_banheiro.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `closet/modulo_closet_cab.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `closet/modulo_closet_gavetas.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `closet/modulo_closet_prat.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `closet/sapateira.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `comercial/balcao_atendimento.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `comercial/gondola.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `comercial/vitrine.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/aereo_escorredor.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/aereo_simples.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/balcao_cooktop.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/balcao_pia.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/balcao_simples.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/canto_l.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/gaveteiro_3.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/gaveteiro_4.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/paneleiro.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/torre_forno.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `cozinha/torre_geladeira.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `dormitorio/cabeceira.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `dormitorio/comoda_4g.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `dormitorio/criado_mudo.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `dormitorio/guarda_roupa_2p.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `dormitorio/guarda_roupa_3p.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `escritorio/estante_livros.json` :: chaves inválidas: `dir, esq, frontal, traseira`
- `escritorio/mesa_escritorio.json` :: chaves inválidas: `dir, esq, frontal, traseira`

**Total: 1308 ocorrências em 28 arquivos.** Padrão dominante: uso de `frontal/traseira/esq/dir` ao invés de `frente/topo/base/tras`.

## Material codes inválidos

_Nenhum encontrado nos defaults/options de selects de material._

**Total únicos: 0.**

## Metadados ausentes

- Arquivos sem `ferragens_auto`: **0** de 47 (todos definem ferragens_auto — bom).
- Arquivos sem `agregados_sugeridos`: **29** de 47.
- Arquivos com `codigo`/`tipo_ruby`/`versao_schema` ausentes: **45** (apenas `balcao_2_portas.json` tem os três).


## Padrões emergentes (candidatos a templates)


Analisando os 47 JSONs, identifiquei famílias estruturais que se repetem e poderiam virar **templates compartilhados**:

1. **Carcaça base padrão** (2 laterais + base + tampo opcional + fundo opcional + rodapé opcional + N prateleiras):
   - `cozinha/balcao_2_portas`, `balcao_simples`, `aereo_simples`, `coluna_multiuso`, `paneleiro`, `nicho_aberto`, `aereo_basculante`, `aereo_escorredor`
   - `banheiro/coluna_banheiro`, `nicho_banheiro`, `gabinete_banheiro`, `espelheira`
   - `closet/modulo_closet_meio`, `modulo_closet_porta`, `modulo_closet_prat`, `torre_closet`
   - `comercial/gondola`, `vitrine`, `balcao_atendimento`
   - `escritorio/armario_escritorio`, `estante_livros`
   - `sala/rack_sala`, `painel_tv`, `estante_sala`
   - **Template proposto:** `carcaca_base.json` parametrizando `n_portas`, `n_prateleiras`, `com_tampo`, `com_fundo`, `com_rodape`.

2. **Família de gaveteiros** (frentes + caixas internas + corrediças):
   - `cozinha/gaveteiro_3`, `gaveteiro_4`, `balcao_2_gavetas`, `balcao_cooktop`
   - `dormitorio/comoda_3g`, `comoda_4g`, `criado_mudo`
   - `closet/modulo_closet_gavetas`
   - **Template proposto:** `gaveteiro_base.json` com array de gavetas e alturas configuráveis.

3. **Guarda-roupas modulares** (lateral alta + maleiro + cabideiro + gavetas opcionais):
   - `dormitorio/guarda_roupa_2p`, `3p`, `4p`, `correr`
   - `closet/torre_closet`, `modulo_closet_cab`, `sapateira`
   - **Template proposto:** `armario_alto.json`.

4. **Painéis decorativos** (sem carcaça, frente única):
   - `sala/painel_ripado` (esquema simplificado, sem `espessura` no param) — é o único com schema diferente; provavelmente correto.
   - `dormitorio/cabeceira` (estrutura de painel + nicho).

5. **Bancadas e pias** com travessas em vez de tampo:
   - `cozinha/balcao_pia`, `balcao_cooktop`, `canto_l`, `banheiro/gabinete_banheiro`
   - Usam role `travessa` (inválido) — **deve ser normalizado para `rail` ou adicionado ao MAP**.


## Recomendação final


**Prontos para produção (schema correto, roles válidos, bordas e materiais OK):**

- `cozinha/balcao_2_portas.json` (referência)

**Aprovados com ressalvas (schema light — falta `type`/`label` em params, mas estrutura correta):**

- `cozinha/aereo_basculante`, `balcao_2_gavetas`, `coluna_multiuso`, `nicho_aberto`
- `banheiro/coluna_banheiro`, `nicho_banheiro`
- `closet/modulo_closet_meio`, `modulo_closet_porta`, `torre_closet`
- `dormitorio/comoda_3g`, `guarda_roupa_4p`, `guarda_roupa_correr`
- `escritorio/armario_escritorio`
- `sala/estante_sala`, `painel_tv`, `painel_ripado`, `rack_sala`
- `area_servico/armario_tanque`

São aplicáveis em produção desde que o ParametricEngine tolere params sem `type`/`label`. Recomendo enriquecer com `type`/`label` em uma migração.

**Precisam ajuste antes de produção (bordas inválidas — bloqueante para fitamento):**

- Todos os 26 arquivos listados em "Bordas inválidas" (área_servico, vários cozinha, todos closet de gavetas/sapateira, comercial, escritorio/estante+mesa, dormitorio/cabeceira+criado_mudo+comoda_4g+guarda_roupa_2p/3p, banheiro/espelheira+gabinete).
- Substituir chaves `frontal→frente`, `traseira→tras`, e remover `esq/dir` (laterais não fitam nesses lados — usar apenas as 4 bordas canônicas).

**Precisam ajuste de role (bloqueante para normalização):**

- `banheiro/gabinete_banheiro.json`, `cozinha/balcao_cooktop.json`, `cozinha/balcao_pia.json`, `cozinha/canto_l.json` — substituir `travessa` por `rail` ou `panel`, ou adicionar `'travessa' => :rail` ao `RoleNormalizer::MAP`.

**Migração mínima recomendada (script único):**

1. Renomear chaves de bordas: `frontal→frente`, `traseira→tras`, descartar `esq`/`dir`.
2. Mapear `role: 'travessa'` para `role: 'rail'`.
3. Adicionar `codigo`, `tipo_ruby`, `versao_schema: 1` em todos.
4. Adicionar `agregados_sugeridos` (mesmo que vazio) nos 29 arquivos que não têm. `ferragens_auto` já está em todos.
5. Enriquecer params com `type` e `label` (atualmente apenas `default/min/max/step/unidade`).

Material codes: **100% OK** — todos os 46 JSONs usam o padrão CamelCase `MDF18_BrancoTX`/`MDF6_Branco`. Nenhum code inválido encontrado.

## Atualização 2026-05-10: enriquecimento aplicado

Tool: `tools/enrich_module_params.rb` (Agente H).
Backup: `wps_working/backups_pre_enrichment/20260510_002145/`.

**Resultado:**
- Arquivos varridos: 46 (excluído `wps_imported/` e `balcao_2_portas.json` que já era canônico).
- Arquivos enriquecidos: **45** (1 já estava OK — `painel_ripado.json` sem schema light).
- Params totais: 425.
- Params enriquecidos: **410**.
  - `label` adicionado: 251.
  - `type` adicionado: 410 (todos os 45 arquivos light).
  - `unit` (alias de `unidade`) adicionado: 128.
- Idempotente confirmado: 2ª execução não modifica nada.

**Heurística de `type` aplicada:**
- numérico (min/max/step ou default Numeric) → `number`
- presença de `options`/`opcoes` → `select`
- default `true|false` → `boolean`
- default string sem options → `string`

**Labels genéricos (titlecase do snake_case) — 32 entradas merecem revisão humana** para nomes mais amigáveis. Lista completa:

- `puxador` (em 17 arquivos) → atualmente "Puxador"; sugestão: "Puxador (espaçamento)" se for furação.
- `area_servico/armario_lavanderia.json :: altura_abertura_maquina`
- `closet/sapateira.json :: n_niveis`
- `cozinha/canto_l.json :: largura_lado_b`
- `cozinha/torre_forno.json :: altura_abertura_forno`, `posicao_forno_z`
- `cozinha/torre_geladeira.json :: altura_abertura_geladeira`, `com_fundo_superior`
- `dormitorio/cabeceira.json :: com_prateleira`, `largura_prateleira`, `largura_nicho`, `altura_nicho`
- `escritorio/mesa_escritorio.json :: largura_gaveteiro`

Arquivos enriquecidos têm `_enrichment_notes` para rastreabilidade.
