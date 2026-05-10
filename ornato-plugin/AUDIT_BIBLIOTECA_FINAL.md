# AUDIT BIBLIOTECA FINAL — Plugin Ornato

Data: 2026-05-10 · Escopo: `ornato-plugin/biblioteca/` (read-only)

---

## 1. Integridade do catálogo `.skp`

- `biblioteca/modelos/catalog.json`: **388 entries**, todas com `file_path` válido.
- Validação `File.exist?` (via `os.path.exists`) em cada `file_path`: **0 ausentes**.
- Varredura inversa de `biblioteca/modelos/**/*.skp`: **0 órfãos** (todo `.skp` no FS está catalogado).
- Subpastas presentes: `portas (140)`, `ferragens (64)`, `puxadores (59)`, `acessorios (28)`, `frentes (20)`, `basculantes (18)`, `kits (15)`, `prateleiras (13)`, `gavetas (9)`, `roupeiros (8)`, `corpos (8)`, `consoles (3)`, `nichos (2)`, `aereos (1)`. Soma = 388 ✅.

**Score: ✅** — Catálogo perfeitamente sincronizado com filesystem.

---

## 2. Cobertura de roles

Roles encontrados em **284 JSONs** (47 Ornato + 237 wps_imported), comparados a `Ornato::Core::RoleNormalizer::MAP`:

| Role no JSON      | Ocorrências | No MAP? |
|-------------------|------------:|:-------:|
| door              | 967 | ✅ |
| drawer_front      | 959 | ✅ |
| shelf             | 763 | ✅ |
| lateral           | 508 | ✅ |
| base              | 280 | ✅ |
| top               | 255 | ✅ |
| back_panel        | 255 | ✅ |
| kick              | 248 | ✅ |
| prateleira        |  65 | ✅ |
| porta             |  34 | ✅ |
| frente_gaveta     |  30 | ✅ |
| traseira          |  29 | ✅ |
| lateral_dir       |  28 | ✅ |
| lateral_esq       |  27 | ✅ |
| topo              |  23 | ✅ |
| rodape            |  22 | ✅ |
| lateral_gaveta    |  14 | ✅ |
| divider           |  13 | ✅ |
| divisoria         |   9 | ✅ |
| travessa          |   7 | ✅ |
| fundo_gaveta      |   7 | ✅ |
| traseira_gaveta   |   7 | ✅ |
| rail              |   4 | ✅ |
| panel             |   1 | ✅ |
| slat              |   1 | ✅ |

**Roles inválidos remanescentes: 0.** Todos os 25 roles distintos resolvem via `RoleNormalizer.MAP`. Observa-se duplicação semântica (PT vs canônico) — ex.: `prateleira` (65) coexistindo com `shelf` (763), `porta` (34) com `door` (967). Funciona porque o normalizer absorve, mas indica heterogeneidade entre Ornato (canônico EN) e wps_imported (PT-BR). Sugestão: migrar tudo para canônico após re-export.

**Score: ✅** — Cobertura 100%, mas com inconsistência estilística PT/EN.

---

## 3. Cobertura de materiais

Refs únicas em campos `material_*` nos 284 JSONs (após filtragem de chaves de schema `default/options/label/value`):

**Defaults reais (9):** `MDF6_Branco`, `MDF12_Branco`, `MDF15_Branco`, `MDF18_Branco`, `MDF18_BrancoTX`, `MDF18_Cinza`, `MDF18_Lacado`, `MDF18_Natural`, `MDF25_BrancoTX`.
**Refs órfãs (8):** `Material carcaca`, `Material frentes`, `Material fundo`, `Material painel`, `Material portas`, `Material ripas`, `material_painel`, `material_ripa` — strings descritivas / artefatos do schema, não IDs.

Catálogos disponíveis:
- `biblioteca/materiais/catalogo_materiais.json` — 837 entries, IDs no formato `acacia_carmel`, `arauco_xxx` (nomes WPS de fornecedor).
- `biblioteca/materiais/chapas.json` — 40 entries, IDs no formato `mdf_branco_tx_18`, código `MDF-BTX-18`.

**Match: 0/9 defaults batem em `catalogo_materiais.json` ou `chapas.json`.** Os 9 IDs `MDF{esp}_{cor}` usados nos JSONs **não existem** em nenhum dos dois catálogos. Há um sistema de nomeação paralelo nos JSONs (PascalCase compacto) divergente dos IDs Ornato (`mdf_branco_tx_18`) e dos IDs WPS de fornecedor.

**Score: ❌** — Materiais referenciados nos JSONs não resolvem contra catálogos físicos. Necessário mapping table `MDF18_BrancoTX` → `mdf_branco_tx_18` ou rebatizar nos JSONs.

---

## 4. Cobertura de bordas

Chaves de `bordas:` em todos os 284 JSONs:

| Chave  | Ocorrências |
|--------|------------:|
| frente | 4556 |
| topo   | 4556 |
| base   | 4556 |
| tras   | 4556 |

**Exceções: 0.** Cobertura idêntica e simétrica nas 4 chaves canônicas (`frente/topo/base/tras`). Migrador concluído com sucesso.

**Score: ✅** — 100% conforme schema canônico.

---

## 5. Ferragens `.skp` referenciadas

Refs únicas de `componente_3d` nos 237 JSONs `wps_imported/`:

| Referência                         | Existe |
|------------------------------------|:------:|
| `puxadores/sem_puxador.skp`        | ✅ |
| `ferragens/dobradica_amor_cj.skp`  | ✅ |
| `ferragens/corredica_sobreposta.skp` | ✅ |

**Score: ✅** — Apenas 3 refs distintas, todas presentes. Porém **subutilização severa**: a biblioteca tem 64 ferragens e 59 puxadores `.skp`, mas apenas 3 (4,8%) são realmente referenciadas pelos JSONs paramétricos. 120/123 modelos `.skp` deste eixo nunca são instanciados via JSON.

---

## 6. Categorias subutilizadas (JSON vs `.skp` WPS)

| Categoria   | `.skp` no catálogo | JSONs `wps_imported/` | Cobertura |
|-------------|-------------------:|----------------------:|----------:|
| portas      | 140 | 140 | 100% ✅ |
| frentes     |  20 |  20 | 100% ✅ |
| basculantes |  18 |  18 | 100% ✅ |
| kits        |  15 |  15 | 100% ✅ |
| prateleiras |  13 |  13 | 100% ✅ |
| gavetas     |   9 |   9 | 100% ✅ |
| corpos      |   8 |   8 | 100% ✅ |
| roupeiros   |   8 |   8 | 100% ✅ |
| consoles    |   3 |   3 | 100% ✅ |
| nichos      |   2 |   2 | 100% ✅ |
| aereos      |   1 |   1 | 100% ✅ |
| ferragens   |  64 |   0 | **0% ❌** (uso indireto via `componente_3d`: 2/64 = 3%) |
| puxadores   |  59 |   0 | **0% ❌** (uso indireto: 1/59 = 1,7%) |
| acessorios  |  28 |   0 | **0% ❌** |

JSONs Ornato nativos (não-WPS, schema premium): **47** distribuídos em 8 cômodos, com `cozinha (16)`, `dormitorio (8)`, `closet (7)`, `banheiro (4)`, `sala (4)`, `comercial (3)`, `escritorio (3)`, `area_servico (2)`. Não cobrem todas as 388 famílias `.skp`; representam o conjunto curado paramétrico.

**Subutilização crítica:** ferragens (64), puxadores (59) e acessórios (28) — total **151 modelos `.skp` (39% do catálogo)** sem qualquer JSON paramétrico que os referencie como dependência. Nichos (2 `.skp`) já têm 2 JSONs WPS, mas nenhum JSON Ornato nativo.

---

## 7. Score final

| Área                          | Status | Justificativa |
|-------------------------------|:------:|---------------|
| 1. Integridade catálogo `.skp` | ✅ | 388/388 arquivos OK, 0 órfãos. |
| 2. Roles                       | ✅ | 25 roles distintos, todos no `MAP`; mistura PT/EN. |
| 3. Materiais                   | ❌ | 9/9 IDs `MDF*_*` usados nos JSONs não existem em `catalogo_materiais.json` nem `chapas.json` — falta mapping. |
| 4. Bordas                      | ✅ | 100% conformes (`frente/topo/base/tras`), 0 exceções. |
| 5. Ferragens via `componente_3d` | ✅ | 3/3 refs resolvem; mas baixíssima utilização. |
| 6. Categorias                  | ⚠️ | WPS 100% coberto; 151 `.skp` (ferragens/puxadores/acessórios) sem JSONs próprios. |

**Veredito global: ⚠️** — biblioteca íntegra fisicamente e estruturalmente conforme, com **um problema bloqueante** (mapping de materiais) e **uma lacuna estratégica** (falta JSONs paramétricos para ferragens/puxadores/acessórios). Roles e bordas estão impecáveis.
