# Pipeline de Furações 3D (WPS .skp → ERP G-code)

## Princípio

Os arquivos `.skp` da biblioteca WPS (388 modelos extraídos em
`biblioteca/modelos/`) contêm geometria pré-existente de furações
(furos de dobradiça, sistema 32, minifix, recortes), modeladas pelos
engenheiros da WPS. **Essa geometria é a fonte da verdade para o
G-code CNC** — não regeneramos furos, preservamos os existentes.

## Fluxo end-to-end

```
[1] JSON paramétrico do módulo (biblioteca/moveis/.../*.json)
        │
        │  ferragens_auto: [{ regra: "dobradica", componente_3d: "ferragens/x.skp",
        │                     anchor_role: "lateral", qtd: "{n_dobradicas}" }]
        ▼
[2] JsonModuleBuilder.process_ferragens_3d  ✅ implementado
        │
        │  - definitions.load(.skp)           ← preserva geometria interna
        │  - add_instance(definition, tx)     ← instancia adjacente à âncora
        │  - set_attribute('Ornato', 'preserve_drillings', true)
        │  - set_attribute('Ornato', 'drilling_source', 'wps_skp')
        ▼
[3] Geometria SketchUp final
        │
        │  - Group módulo (tipo=modulo)
        │    ├─ Group lateral_esq (tipo=peca)
        │    ├─ Group lateral_dir (tipo=peca)
        │    ├─ ComponentInstance dobradica#1 (tipo=ferragem, preserve_drillings=true)
        │    └─ ComponentInstance dobradica#2 (tipo=ferragem, preserve_drillings=true)
        ▼
[4] Exportador UPM JSON  ⏳ PENDENTE
        │
        │  Para cada ComponentInstance com preserve_drillings == true:
        │    a) Ler ent.bounds e ent.transformation
        │    b) Walking entities da definition (faces, edges) procurando:
        │       - círculos planos (= furos passantes)
        │       - cilindros extrudados (= furos cegos com profundidade)
        │       - retângulos/slots (= rasgos LED, fechadura)
        │    c) Para cada feature, calcular interseção com bounds da peça-chapa
        │       âncora adjacente (resolve_anchor_geometry retorna a peça)
        │    d) Emitir operação CNC:
        │       {
        │         "tipo": "furo_dobradica" | "furo_sys32" | "rasgo_led" | ...,
        │         "peca_id": "lateral_esq",
        │         "x": <mm>, "y": <mm>, "z": <mm>,
        │         "diametro": <mm>, "profundidade": <mm>,
        │         "lado": "topside" | "underside" | "edge_*",
        │         "fonte": "wps_skp:ferragens/dobradica_blum_clip_45.skp"
        │       }
        ▼
[5] ERP recebe UPM JSON e gera G-code (já implementado no ERP)
```

## O que ainda falta (gap conhecido)

**Etapa [4] não está implementada.** Os atributos `preserve_drillings`
e `drilling_source` são gravados pelo `JsonModuleBuilder` (etapa 2),
mas `machining_json.rb` e `machining_interpreter.rb` ignoram instâncias
com `tipo == 'ferragem'` hoje.

### Patch necessário no exportador (próximo sprint)

Arquivo: `ornato_sketchup/machining/machining_json.rb`

Pseudo-código do que falta adicionar:

```ruby
# Após coletar peças-chapa, varrer ferragens 3D
parent_group.entities.each do |ent|
  next unless ent.is_a?(Sketchup::ComponentInstance)
  next unless ent.get_attribute('Ornato', 'preserve_drillings')

  anchor_role = ent.get_attribute('Ornato', 'anchor_role')
  anchor_piece = find_piece_by_role(anchor_role)

  drilling_extractor = Drillings::SkpFeatureExtractor.new(ent.definition)
  drilling_extractor.features.each do |feat|
    # Transformar coordenadas locais → mundo → relativas à peça-âncora
    world_pt = ent.transformation * feat.point
    local_pt = anchor_piece.transformation.inverse * world_pt

    upm_ops << {
      'tipo'        => feat.type,           # 'furo_dobradica' etc
      'peca_id'     => anchor_piece.entityID,
      'x_mm'        => local_pt.x.to_mm,
      'y_mm'        => local_pt.y.to_mm,
      'z_mm'        => local_pt.z.to_mm,
      'diametro_mm' => feat.diameter,
      'profundidade_mm' => feat.depth,
      'lado'        => feat.face,
      'fonte'       => "wps_skp:#{ent.get_attribute('Ornato','componente_3d')}"
    }
  end
end
```

E classe nova:

`ornato_sketchup/machining/skp_feature_extractor.rb`
- Walking de `definition.entities`
- Heurísticas para classificar feature: círculo planar → furo passante;
  edges circulares com face de fundo → furo cego; retângulo + extrusão → rasgo

## Estado atual (10 maio 2026)

| Etapa | Status |
|---|---|
| [1] JSON paramétrico aceita `componente_3d` | ✅ schema documentado |
| [2] JsonModuleBuilder instancia + carimba | ✅ implementado |
| [3] Geometria com furações preservadas | ✅ via definitions.load |
| [4] Exportador UPM extrai features | ⏳ TODO próximo sprint |
| [5] ERP gera G-code de UPM JSON | ✅ existente |

**Importante:** etapa [3] já está funcional. A geometria final no
SketchUp já tem todas as furações originais da WPS. O que falta é
**ler essa geometria e mandar pro ERP** — etapa [4].

Enquanto [4] não chegar, o usuário consegue ver e usar as ferragens
3D no SketchUp normalmente, e a exportação UPM continua emitindo
operações de furação **das peças-chapa diretamente** (regras antigas
em `ferragens_auto` sem `componente_3d`). Os dois caminhos coexistem.

## Apêndice — Schema final UPM `lado` (Sprint 2)

`MachiningJson::VALID_SIDES` (em `ornato_sketchup/machining/machining_json.rb`)
foi estendido para aceitar os 8 valores abaixo. O serializer envia o lado
**cru** (sem mapear) ao UPM, porque a router CNC precisa saber se a operação
é de face ou de borda lateral para escolher cabeçote/árvore.

| `lado` (string)  | Origem                              | Categorias permitidas | Observações                                  |
|------------------|-------------------------------------|-----------------------|----------------------------------------------|
| `a`              | Path 2D legado                      | qualquer              | Face superior da chapa                       |
| `b`              | Path 2D legado                      | qualquer              | Face inferior da chapa                       |
| `topside`        | Path 3D WPS (`detect_face_side`)    | qualquer              | Equivalente a `a` em furações 3D             |
| `underside`      | Path 3D WPS                         | qualquer              | Equivalente a `b` em furações 3D             |
| `edge_left`      | Path 3D WPS (eixo X− local)         | apenas `hole`         | Diâmetro ≤ 12mm (sistema 32 / minifix)       |
| `edge_right`     | Path 3D WPS (eixo X+ local)         | apenas `hole`         | Diâmetro ≤ 12mm                              |
| `edge_front`     | Path 3D WPS (eixo Y+ local)         | apenas `hole`         | Diâmetro ≤ 12mm                              |
| `edge_back`      | Path 3D WPS (eixo Y− local)         | apenas `hole`         | Diâmetro ≤ 12mm                              |

`MachiningJson#validate` reforça as duas regras de borda (categoria `hole` +
diâmetro ≤ `EDGE_MAX_DIAMETER_MM = 12.0`). Operações de borda fora desse
envelope geram erro de validação ao invés de virar G-code inválido.
