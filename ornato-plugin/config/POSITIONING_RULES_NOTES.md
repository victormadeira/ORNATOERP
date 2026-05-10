# positioning_rules.json — notas de inferência

Documento curto explicando como cada regra em `positioning_rules.json` foi derivada dos `.wctr` da WPS e onde a convenção de fabricante foi aplicada.

## Estrutura do .wctr (resumo)

Um `.wctr` é um XML com a forma:

```xml
<Entity name="..." offsetBack="0" offsetBottom="0" offsetFront="0" offsetLeft="0" offsetRight="0" offsetTop="0">
  <VerticalAlignment   options="top|bottom|middle|all" value="..."/>
  <HorizontalAlignment options="left|right|middle|all" value="..."/>
  <DepthAlignment      options="front|middle|back|all" value="..."/>
  <FieldSets>
    <FieldSet FieldName="..." options="..." title="..." value="..."/>
  </FieldSets>
</Entity>
```

Campos usados na inferência: `Vertical/Horizontal/DepthAlignment` (âncora), `offset*` (recuos do bounding box), `FieldSet` (parâmetros do usuário — quantidades, recobrimentos, posição de puxador, lado de porta).

A geometria fina (qual furo, qual passo) está dentro dos `.lib` — arquivos ZIP contendo `.skp` paramétrico do SketchUp. Esses .skp não são extraíveis por XML, então as constantes (espaçamentos, recuos da face, folgas) vêm de norma de fabricante.

## Por regra

- **dobradica** — `Kit Porta Dobradica_CTR.wctr` declara apenas `recobrimento*`, `posicaopuxador`, `ladoporta`. O .wctr não diz quantas dobradiças nem o passo. Defini `offset_top_first=offset_bottom_last=100` e `spacing_max=600` (padrão Blum/europeu). `count_rule` segue tabela Blum por altura de porta. `depth_offset_from_face=4` é o recuo padrão da caneca de 35mm na face interna.
- **corredica_telescopica** — `Kit Gaveta_CTR.wctr` e `Sapateira Corred. Telescopica_CTR.wctr` expõem só `wpsuserdrawerquantity`. Mapeei `mounting=side_pair`, folga lateral `12.7mm` (padrão FGV/Hettich) e recuo traseiro `13mm`. Quantidade = 1 par por gaveta.
- **corredica_oculta** — `Sapateira Corredica Oculta_CTR.wctr` idem. Diferenciei pelo `mounting=under_bottom` e folga `6.5mm` (Tandem Blum).
- **puxador** — Usei o campo `posicaopuxador` que aparece em todos os Kit Porta. Mapeamento `superior→top edge +50mm`, `inferior→bottom edge +50mm`, `centralizado→middle`. Os defaults por kit foram lidos do `value=` de cada `.wctr` (ex.: Kit Porta Dobradica = `superior`, Kit 2 Portas Altas = `centralizado`).
- **pe_nivelador** — `Pe Nivelador Plastico CJ_CTR.wctr` força `VerticalAlignment options='bottom' value='bottom'` (única opção), portanto a regra é "sempre na base". Altura padrão `150mm` extraída direto do FieldSet `wpsuseralturapenivelador`. Distribuição 4/6/8 por largura é convenção marcenaria.
- **cabideiro** — Único caso onde o .wctr é altamente específico: `VerticalAlignment options='top' value='top'` (só topo) e `DepthAlignment options='front;middle;back' value='middle'` (3 opções discretas, default middle). Inferido `vertical_offset_from_top=60mm` por convenção (Hafele/Häfele).
- **suporte_prateleira_pino** — `Prateleira CJ_CTR.wctr` tem `offsetFront=20`, indicando que a prateleira é embutida 20mm da face. Os pinos de 5mm a 37mm da face (frente/fundo) e 4 por prateleira são padrão. Não há campo no .wctr para isso.
- **suporte_prateleira_cantoneira** — `Prateleira Fixa_CTR.wctr` traz `offsetBottom=800` (altura padrão da prateleira) e `offsetFront=50`. `VerticalAlignment` permite `top/bottom/middle`, default `bottom`. Identifiquei como cantoneira fixa (vs pino regulável).
- **minifix** — Não tem `.wctr` próprio. Inferido pela existência das peças `Lateral com fixacao` vs `Lateral sem fixacao`, `Base com fixacao` vs `Base sem fixacao`, etc. — o sufixo "com fixacao" indica peça que recebe minifix. Espaçamento e recuos vêm de norma (Hettich/Blum).

## Limitações

1. Quantidades exatas de dobradiças e passos de furação para sistema 32 não estão no .wctr — só nos .skp. As regras marcadas `source: convention` devem ser validadas contra um módulo de referência da Ornato antes de produção.
2. Os campos `recobrimento*` (`total/parcial/embutido/passante`) afetam o offset do puxador e da dobradiça mas a fórmula exata depende do .skp. Recomendado testar overlays parciais e ajustar `offset_top_first`/`depth_offset_from_face` por kit.
3. ~~`Kit Desl RO47/RO65` (deslizantes) e Aventos não foram cobertos aqui~~ — cobertos no Apêndice B abaixo (Agente G, 2026-05-10).

## Apêndice A — famílias adicionadas (Aventos, Basculante Pistão, Deslizantes)

Adicionadas 4 famílias em `positioning_rules.json` (Agente G). Os `.wctr` dessas famílias são pobres em dados: anchor sempre `all/all/all`, FieldSets limitados a `recobrimento*` (Aventos/Basculante) ou `PortaFrontal` + `wpsusermodelotrilhoportaspequena` (Deslizantes). A maior parte da regra é convenção de fabricante. Confidence média **low** (3 de 4 regras `low`, 1 `medium`).

- **aventos_basculante** — `KIT AVENTOS HF/HK/HL/HS_CTR.wctr` são idênticos exceto pelo nome. Inferi 4 variantes (HF/HK/HL/HS) por sufixo do nome do arquivo, mapeando para tipos de movimento Blum (parallel_lift, lift_up, two_panel_lift, swing_up). O .wctr não traz nº de pistões nem dobradiças → convenção Blum: 2 pistões fixados na lateral (offset 70mm do topo, 100mm do fundo) + 2 dobradiças caneca 35mm na porta. `confidence: low`.
- **basculante_pistao** — `Kit Basculante Pistao Superior_CTR.wctr` e `…Inferior_CTR.wctr` diferem apenas em `recobrimentoinferior` (Superior=`total`, Inferior=`parcial`), o que confirma que "Superior" tem porta articulando no topo e "Inferior" no fundo. Mapeei a `posicao` por sufixo do nome. Pistão a gás 100N convencional, 2 unidades. `confidence: low`.
- **corredica_deslizante** (RO47/RO65) — Os 6 `.wctr` (`Kit Desl RO47 2/3/4/5 Portas`, `RO65 2/3 Portas`) são vazios (sem FieldSets). Tudo vem do nome: RO47 vs RO65 (via prefixo) → carga 25kg/45kg, e o `(\d+) Portas` indica nº de pares de corrediças (cada "porta" no nome representa uma gaveta). Geometria FGV série RO padrão. `confidence: low`.
- **porta_correr** — Único do grupo com dados úteis: `Kit Deslizante 2 Portas` traz `PortaFrontal` (direita/esquerda) e `wpsusermodelotrilhoportaspequena` (sobreposto/embutido), default `embutido`/`esquerda`. `Kit Deslizante 1 Porta` só tem `PortaFrontal`. Regex `Kit Deslizante (\d+) Portas?` captura `n_tracks` (1/2). Trilho top + bottom obrigatórios. `confidence: medium`.

## Apêndice B — mapeamento regra → componente 3D (default)

Inventário real de `biblioteca/modelos/basculantes/` (18 .skp) e `biblioteca/modelos/portas/` (porções deslizante/basculante). Componente default é o `.skp` mais "neutro" (sem variante FS/fecho-toque/puxador específico).

### `aventos_basculante`
- HF default → `biblioteca/modelos/portas/porta_basculante_lisa_superior_aventos_hf.skp`
- HF moldura → `biblioteca/modelos/portas/porta_basc_mold_rebaixo_sup_aventos_hf.skp`
- HF perfis → `biblioteca/modelos/basculantes/basculante_perfil_3136_hf.skp`, `…3345_hf.skp`, `…3446_hf.skp`, `basculante_moldura_com_recorte_hf.skp`
- HK/HL/HS → fallback `porta_basculante_lisa.skp` (não há .skp dedicado HK/HL/HS na biblioteca atual; usar genérico até ampliar inventário)

### `basculante_pistao`
- Superior default → `biblioteca/modelos/basculantes/basculante_puxador_7015_perfil_3136_superior.skp` (ou `…3345_superior.skp`, `…3446_superior.skp` por perfil)
- Inferior default → `biblioteca/modelos/basculantes/basculante_puxador_7015_perfil_3136_inferior.skp` (ou variantes 3345/3446)
- Genérico (sem perfil) → `biblioteca/modelos/portas/porta_basculante_lisa.skp`
- Variante fecho-toque → sufixo `_fecho_toque` ou `_fs` (fecho suave) disponível em quase todos

### `corredica_deslizante` (RO47/RO65)
- Não há `.skp` da própria corrediça na pasta `basculantes/` ou `portas/` — pertence à categoria ferragem/corrediça (fora deste inventário). Default sugerido: usar o mesmo asset 3D de `corredica_telescopica` com escala/profundidade ajustada por variante (RO47 12mm, RO65 16mm) até modelagem dedicada estar disponível.

### `porta_correr`
- 1 porta lisa → `porta_deslizante_lisa.skp` (variante reduzida: `porta_deslizante_lisa_p.skp`)
- 1 porta moldura → `porta_deslizante_moldura_rebaixo.skp` / `porta_desliz_moldura_rebaixo_p.skp`
- 2+ portas central lisa → `porta_deslizante_central_lisa.skp`
- 2+ portas externa lisa → `porta_deslizante_externa_lisa.skp` / `porta_deslizante_externa_central_lisa.skp`
- Com puxador 7015 perfil 3136/3345/3446 → `porta_deslizante_central_puxador_7015_perfil_*.skp` ou `porta_deslizante_lateral_puxador_7015_perfil_*.skp`
- Outros puxadores: `porta_deslizante_puxador_2009.skp`, `…_gola.skp`, `…_montana_cava.skp`, `…_cava_aluminio.skp`

Resolução de variante: para `porta_correr`, escolher entre `central` / `lateral` / `externa` conforme posição da porta no kit (1 porta = lateral; 2+ portas = mix central/externa). Para `aventos_basculante`, priorizar match exato do sufixo `_aventos_hf` no nome do .skp; fallback genérico.

