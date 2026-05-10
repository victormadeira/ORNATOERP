# Validação CAVILHA → ROUTER CNC

**Pergunta:** *"Vou conseguir importar a cavilha na router?"*

**Resposta direta:** ⚠️ **PARCIAL.** O caminho **legacy (sem `componente_3d`)** chega à router com furos válidos. O caminho **3D novo (`componente_3d: ferragens/cavilha_cj.skp`)** está implementado mas tem **um bug de schema bloqueante** e **uma instância vazia provável** que precisam de patch antes de produzir.

---

## Mapa do pipeline

```
JSON ferragens_auto
   │
   ├── (A) regra "cavilha" + juncao "lateral × base"        ← LEGACY
   │       │
   │       ▼
   │   JsonModuleBuilder        ← apenas serializa atributo (não gera 3D)
   │       │
   │       ▼
   │   MachiningInterpreter#add_junction_joints (line 168)   ✅
   │       │
   │       ▼
   │   Hardware::DowelRule#generate                          ✅
   │       │  (Ø8 × 15mm, spacing 128, edge 50)
   │       ▼
   │   ops {category: hole, side: "a"|"b", x, y, dia, depth} ✅ schema OK
   │       │
   │       ▼
   │   MachiningJson#serialize → workers UPM                 ✅
   │       │
   │       ▼
   │   JsonExporter ("machining" key) → ERP/Router           ✅
   │
   └── (B) regra "*" + componente_3d "ferragens/cavilha_cj.skp"  ← NOVO
           │
           ▼
       JsonModuleBuilder#process_componente_3d              ✅ instancia + carimba
           │  (preserve_drillings=true, anchor_role=...)
           ▼
       MachiningInterpreter pula (line 143 next if componente_3d) ✅
           │
           ▼
       FerragemDrillingCollector#collect                    ✅ percorre instâncias
           │
           ▼
       SkpFeatureExtractor#extract                          ⚠️  vazio se .skp
           │  (>=6 segmentos curvos pra ser furo)               não tem furos modelados
           ▼
       op_bruta {category:"hole", side: :topside|:edge_left...}  ❌ side INVÁLIDO
           │
           ▼
       MachiningJson#serialize                              ❌ side aceita só "a"/"b"
                                                                (linha 22, VALID_SIDES)
```

---

## Cenário A — Balcão 2 portas, `tipo_juncao: "cavilha"` (LEGACY)

`biblioteca/moveis/cozinha/balcao_2_portas.json` tem regras condicionais:

```
{ "regra": "cavilha", "juncao": "lateral × base", "condicao": "{tipo_juncao} == 'cavilha'" }
{ "regra": "cavilha", "juncao": "lateral × top",  "condicao": "..." }
```

Path: `MachiningInterpreter` → `DowelRule` (`hardware/dowel_rule.rb`).
- 2 laterais × 2 (base + topo) = 4 junções
- Cada junção: `calculate_positions(joint_length=560mm, spacing=128)` → `floor(460/128)+1 = 4 furos`
- **Total: 16 furos por peça lateral × 2 laterais + 8 nas bases/topos = ~32 furos**, todos `category:"hole"`, `side:"a"|"b"`, `tool_code:"broca_8mm"`, Ø8 × 15mm.

**Verdict:** ✅ **G-code sai válido.** Schema UPM OK, ferramenta padrão OK, posicionamento OK.

---

## Cenário B — `componente_3d: "ferragens/cavilha_cj.skp"` (3D NOVO)

Nenhum JSON em `biblioteca/moveis/` referencia `cavilha_cj.skp` hoje (só `dobradica_amor_cj`, `corredica_sobreposta`, `puxadores/*`). O `.skp` existe em `biblioteca/modelos/ferragens/cavilha_cj.skp`.

**Bloqueios encontrados:**

### ❌ GAP 1 — Schema mismatch de `side` (CRÍTICO)
`FerragemDrillingCollector#detect_face_side` (linha 179) emite `:topside | :underside | :edge_front | :edge_back | :edge_left | :edge_right`. Mas `MachiningJson::VALID_SIDES = %w[a b]` (linha 22). Resultado: `validate()` rejeita TODA op vinda de `componente_3d`. O `serialize` ainda passa o valor cru para o JSON (não filtra), o que faz o ERP/router receber `"side":"topside"` que não é mapeável → operação ignorada ou erro de parse.

### ⚠️ GAP 2 — `cavilha_cj.skp` provavelmente sem furos modelados
A cavilha em si é um cilindro Ø8×30. O **furo na chapa** (que é o que importa pra router) está modelado *na própria chapa-âncora*, não no componente da cavilha. O `SkpFeatureExtractor` exige ≥6 edges curvas (linha 67) para classificar como furo — ele extrai a forma do **cilindro da cavilha**, não o furo. Resultado provável: feature `:furo_passante` Ø8 × 30mm com normal ao longo do eixo da cavilha. Isso é fisicamente errado: o furo CNC é Ø8 × 15mm em cada peça, não 30mm passante.

### ⚠️ GAP 3 — Posicionamento (sistema 32 / espaçamento)
`config/positioning_rules.json` **não tem entrada `cavilha`** (só `dobradica`, `corredica_telescopica`, ...). `JsonModuleBuilder#process_componente_3d` (linha 151) usa offsets genéricos de `entry['offset_top']/offset_bottom']/spacing_max'` ou defaults 100/100/600 — não há regra específica de cavilha (sistema 32 / 128mm / borda 50mm).

### ⚠️ GAP 4 — `profundidade_mm` da feature isolada = 0
`build_isolated_hole` (linha 273) emite `profundidade_mm: 0.0`. `MachiningJson#validate_hole` rejeita `depth <= 0`.

---

## Lista exata de gaps (em ordem de prioridade)

1. **`MachiningJson` precisa aceitar/normalizar lados 3D** (`topside→a`, `underside→b`, `edge_*→a` com flag de borda) **OU** `FerragemDrillingCollector` precisa converter `:topside/:edge_*` → `"a"/"b"` antes de emitir.
2. **`cavilha_cj.skp` precisa ser remodelado** com 2 furos (um em cada metade) com normal correto, OU o pipeline precisa gerar a furação da chapa via regra paramétrica e usar o `.skp` só pra visualização.
3. **Adicionar regra `cavilha` em `config/positioning_rules.json`** com `spacing_max: 128`, `offset_top_first: 50`, `offset_bottom_last: 50`.
4. **Profundidade default** quando `:furo_cego` isolado (depth=0) — usar metade da espessura da peça-âncora (≈ 8–9mm) ou ler do JSON da cavilha (`biblioteca/ferragens/cavilhas/cavilha_8x30.json` já tem `furo_peca.profundidade: 15`).

---

## Comando de teste manual proposto

Para o próximo dev (rodar dentro do SketchUp Ruby Console com plugin carregado):

```ruby
# 1) Verifica que o .skp tem furos extraíveis
defn = Sketchup.active_model.definitions.load(
  File.expand_path('../biblioteca/modelos/ferragens/cavilha_cj.skp',
                   Ornato::PLUGIN_ROOT))
feats = Ornato::Machining::SkpFeatureExtractor.new(defn).extract
puts "Features extraídas: #{feats.size}"
feats.each { |f| puts "  #{f[:tipo]} Ø#{f[:diametro_mm]} prof=#{f[:profundidade_mm]} normal=#{f[:normal].to_a}" }

# 2) Carrega balcão_2_portas com tipo_juncao=cavilha (path LEGACY)
#    e exporta UPM — verifica side="a"/"b"
mod = Ornato::Library::JsonModuleBuilder.build_from_id(
  'balcao_2_portas', { 'tipo_juncao' => 'cavilha', 'largura' => 600 })
upm = Ornato::Export::JsonExporter.new(...).export
errs = Ornato::Machining::MachiningJson.new.validate(upm['machining'].values.first['workers'])
raise "VALIDAÇÃO FALHOU: #{errs}" unless errs.empty?
puts "LEGACY OK — #{upm['machining'].values.first['workers'].size} ops"

# 3) (após patch) Mesmo teste com componente_3d em ferragens_auto
```

---

## TL;DR

- **Quem importa cavilha hoje?** Apenas o caminho `regra: cavilha + juncao` (legacy/paramétrico). Esse roda direto pra router. ✅
- **Caminho 3D (`componente_3d`)?** Implementado end-to-end mas com bug de `side` que invalida o JSON UPM, e o `.skp` precisa ser auditado (provavelmente não tem os furos da chapa). ❌ até patch.
- **Recomendação:** continuar usando o path legacy para cavilhas estruturais; restringir `componente_3d` a ferragens com geometria de furo modelada (dobradiça, corrediça) até GAPs 1–4 fecharem.
