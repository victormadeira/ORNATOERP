# WPS — Insights Perdidos (Pente-fino R3)

Pente-fino sobre o que ficou de fora das extrações (catálogo, defaults, constructors). Foco em _orquestração_, não atributos crus. Paths absolutos em `ornato-plugin/wps_source/`.

---

## 1) Cinco estruturas-chave NÃO absorvidas

1. **`OptionalChildren`/`Category` (agregados)** — `aggregate collection/Lateral com fixacao.xml`. Peças "filhas opcionais" anexadas a um pai com **fórmulas** de posição. Constructor é molde rígido; agregado é _associação fraca_ pai→filho com regras dimensionais.
2. **`Group` em Model Options** — `Model Options.xml`. 12 grupos (Cj Corpos Roupeiros, Corpo Console/Nicho/Roupeiros, Corporativo, Ferragens, Frentes e Mascaras, Gavetas, Kit Portas, Portas, Prateleiras, Puxadores). Cada `<ModelOption Name>` mapeia **slot lógico** (`corredicas_telescopicas`) → lista de `.lib` intercambiáveis. **Registro polimórfico**: o pai pede "uma corrediça telescópica", não conhece o modelo.
3. **`MaterialOptionCollection`** — `Material Options.xml`, 13 grupos × 57 slots. Mesma arquitetura aplicada a `.skm`: slot (`corpo_cozinha`, `fitas_de_borda_corpos`) → materiais permitidos.
4. **`FieldSets` em constructors** — `constructor/*.wctr`. Enums semânticos: `options="total;parcial;embutido"` (recobrimento), `wpsuserdrawerquantity 1;2;3;4;5;6;7`, `posicaobatente deitado;em pé`. Ornato usa só atributos numéricos; esses enums controlam **variantes de geometria sem código novo**.
5. **`VerticalAlignment`/`HorizontalAlignment`/`DepthAlignment`** — `Lateral sem fixacao_CTR.wctr`: `HorizontalAlignment options='left;right;middle' value='right'`. **Onde a peça é ancorada** dentro do BB do pai. Regra de encaixe que nenhum extrator capturou — chave pra reflow quando o módulo redimensiona.

---

## 2) Sistema de "agregados" — como funciona

Um **agregado** = peça opcional que se gruda em outra peça quando ela é inserida. Estrutura única real encontrada:

`wps_source/aggregate collection/Lateral com fixacao.xml`:
```xml
<OptionalChildren>
  <Category name='Lateral'>
    <Child file='…\Avulsos\Estrutura\Batente com fixacao.lib' title='Batente com fixacao'>
      <Properties>
        <_x_formula>Parent!LenY-LenY</_x_formula>
        <_y_formula>ParentLenY</_y_formula>
        <_z_formula>Parent!LenZ</_z_formula>
        <lenx>60</lenx><leny>57,5</leny><lenz>9</lenz>
      </Properties>
    </Child>
  </Category>
</OptionalChildren>
```

**Léxico:** `Parent!LenY` = ref cruzada (lê Y do pai); `ParentLenY` (sem `!`) = valor herdado; `_x_formula` = posição relativa; `lenx/y/z` = default se fórmula não calcular. **Os outros 6 .xml estão vazios** (`<OptionalChildren/>`) — feature subutilizada até pela WPS. **Modelagem Ornato:** `aggregate_rules (parent_id, child_lib, formula_x/y/z, default_dims, category)` + avaliador com vars `Parent.LenX/Y/Z` e `Self.LenX/Y/Z`.

---

## 3) Sistema de "Groups" em Model Options — herança/override

Cada `Group` é **namespace** com `Enable=true/false` (liga/desliga grupo inteiro). Dentro, cada `ModelOption` é **slot polimórfico** com `.lib` candidatos, cada um com `Enable` individual.

Exemplo (Group "Ferragens"): `dobradicas` (6 modelos), `dobradicas_canto_reto` (6), `dobradicas_155` (2), `dobradicas_155_canto_l` (2), `dobradicas_curva` (4), `corredicas_ocultas`, `corredicas_telescopicas`, `corredicas_telescopicas_com_distanciador`…

Não é herança OO. É **resolução por contexto**: o template pede `slot=dobradicas_155_canto_l`; sistema escolhe o primeiro `Enable=true` (ou pergunta). Permite **swap em massa** de fornecedor — trocar marca em todos os módulos = 1 toggle.

**Modelo Ornato:** `model_slots (slot, group, enabled)` + `slot_models (slot, lib_path, priority, enabled)`. UI: listagem agrupada com toggle. Peça de hardware no orçamento referencia `slot`, resolver pega o ativo.

---

## 4) Material Options — categorias e implicações

`wps_source/Material Options.xml`. 13 grupos × 57 slots. Mapeamento condensado:

| Group | Slots-chave | Implicação Ornato |
|---|---|---|
| Acessorios e decoracao | luminarias, interruptores_e_tomadas, pes_madeira_maciça, pes_metal, pes_plasticos, cabeceiras_estofadas | Catálogo precisa **subcategorizar pés** por matéria-prima |
| Corpos | corpo_cozinha, corpo_dormitorio, corpo_home_office, corpo_interno, corpos | Mesmo MDF tem 5 slots distintos por **ambiente** — material certo varia por uso |
| Estruturas Metálicas | metalon, ponteira_metalon, tubo | Nova categoria que Ornato não tem isolada |
| Ferragens | articulador_duo/free_space/maxi/free_flap, corredica, puxador_galla, suporte_plastico, tambor_rafix | Acabamento de hardware = pintura/finish, não chapa |
| Fitas de borda | fitas_de_borda_corpos, _frontal, _porta_espelho, _puxador, postforming | **4 variantes de fita** por aplicação (não só por cor) |
| Paineis | paineis, palhas, negativos | "Negativos" = material aplicado em sulco/cava |
| Perfil PVC | cores_pvc, perfil_2009, perfil_j, perfil_puxador_facetato, perfil_puxador_montana_cava | Perfil tem catálogo separado de cores |
| Perfis Ponteiras e Vidros | perfis, perfis_trilhos, ponteira_puxador_*, vidros | Vidro junto com perfis (pertinência de aplicação) |
| Portas Frentes e Basculantes | frentes, portas, portas_e_frentes, portas_e_frentes_pintadas | **Pintada** ≠ **revestida**: catálogos separados |
| Puxadores | pintura_puxador, puxador_usinado | Puxador usinado herda material da porta |
| Tampos e Laterais | soltos, tamponamentos | "Tamponamento" = peça de fechamento lateral, slot próprio |
| Travessas | travessa_mesa | Mesa é caso especial |

**Padrão:** WPS NÃO restringe por catálogo de chapa, restringe por **função da peça**. Ornato hoje atribui material livremente — risco de o cliente escolher fita de borda como tampo.

---

## 5) Três easter eggs

1. **`offsetBack/Front/Left/Right/Top/Bottom` no `<Entity>`** — todos `0.0` em `Batente com fixacao_CTR.wctr`, mas presente nos **64** .wctr. **BB virtual** que recolhe a peça sem mexer em LenX/Y/Z. Folga sem editar dimensão. Ornato não tem — colide na 3D ao redimensionar.
2. **Categoria `Itinerario`** em `global_attributes.xml` — 65+ subcats `wpsgitinerario*` com `value=''`. Não é dimensão: **metadado de roteiro de fabricação** (sequência de peças no plano de corte por tipo de módulo). Ex: `wpsgitinerarioaereobasesuperior`. Cada string vazia = placeholder pra ordem de operações injetada em runtime. **WPS separa _o que é a peça_ (constructor) de _quando é fabricada_ (itinerário).**
3. **`wpsuserdrawerquantity value='5'`** em `Kit Gaveta_CTR.wctr` — enum `1;2;3;4;5;6;7` que **multiplica geometria**. Em vez de 7 constructors, 1 constructor instancia N gavetas. **Constructor paramétrico de cardinalidade** — Ornato cria item separado por contagem.

---

## 6) Riscos legais — o que NÃO copiar diretamente

`libinfo.xml` traz: `<name>Biblioteca WPS</name>`, `companyId 124`, `id 1`, datas.

- **"Biblioteca WPS" / "WPS"** = marca. Renomear pra `Ornato Library` antes de import.
- **Prefixos `wpsg…` / `wpsuser…`** nos atributos — assinatura técnica. Adotar `ornato_g…` / `ornato_user…`.
- **Paths `Biblioteca WPS\\models\\…`** crus em XMLs — não bundlear. Reescrever para `Ornato\\…`.
- **Nomes `.lib` específicos** (ex: `Frente Puxador 7015 Perfil 3136.lib`) referenciam SKUs reais (Häfele, Blum) — replicar a _categoria_ sem número de catálogo.
- **Geometria literal dos .skp/.skm** (388 modelos + texturas) — NÃO redistribuir. Referência apenas; gerar geometria própria.
- `companyId 124`, `id 1` — IDs internos, gerar próprios.

**Seguro:** o **padrão estrutural** (Group/slot, OptionalChildren, FieldSets enum, OffsetBox, Itinerario, Alignment) — arquitetura não é protegível.

---

## 7) Recomendação — três estruturas a replicar primeiro

**Prioridade 1 — Model Options + Material Options (slots polimórficos).**
ROI imediato: vira 1 dropdown por slot na UI do módulo, swap global de fornecedor em 1 clique, validação de "que material pode ir nessa peça". Schema pequeno (3 tabelas), absorve 133 mappings (76 model + 57 material) sem geometria nova. Resolve dor real do orçamento.

**Prioridade 2 — Alignment (V/H/Depth) + Offsets na peça.**
Sem isso, redimensionar módulo continua quebrando posicionamento. 6 floats + 3 enums por constructor. Custo baixo, destrava reflow automático. Requer mudança no engine 3D (renderer Ornato), não só dados.

**Prioridade 3 — Aggregates com fórmulas (OptionalChildren).**
Maior alavanca de longo prazo: permite a "biblioteca viva" (lateral arrasta seu batente; gaveta arrasta sua corrediça). Custo: precisa de avaliador de expressões (parser pra `Parent!LenY - LenY`). Adiar até P1+P2 estarem em produção, porque exige UX nova (drag-drop com regras) e a própria WPS subutiliza (6 de 7 .xml vazios).

**Deixar pra depois:** Itinerario (metadado de fabricação — só faz sentido quando Ornato tiver módulo CAM/plano de corte maduro), FieldSets enum-driven (só compensa após constructor paramétrico de cardinalidade ser introduzido).
