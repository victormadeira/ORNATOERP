# CNC Post-Processors — Roadmap de Formatos Industriais

**Agente R4 — Padrões de pós-processamento CNC para marcenaria**
**Status atual:** Ornato exporta UPM JSON proprietário → ERP gera G-code.
**Objetivo:** suportar formatos da indústria para virar referência no mercado BR.

---

## 1. Tabela comparativa de formatos

| Formato | Vendor / Owner | Tipo | Schema público? | Máquinas-alvo | Operações suportadas | 5-eixos / multi-tool | Esforço Ornato (1-10) | ROI BR |
|---|---|---|---|---|---|---|---|---|
| **UPM JSON** (atual) | Ornato | JSON proprietário | Sim (interno) | ERP Ornato → G-code genérico | furo, rasgo, recorte | parcial | — | base |
| **DXF 3D + camadas** | Autodesk (aberto) | CAD vetorial | Sim — DXF Reference (Autodesk) | Quase todo CAM (AlphaCam, Enroute, Vectric, NestFab) | recorte 2D, furo (camada), pocket (camada) | não nativo (depende do CAM) | **2-3** | **Altíssimo** |
| **BTLX** | design2machine consortium | XML aberto | **Sim** — XSD público v2.3.1 (jul/2025) | Hundegger, Weinmann, Krüsi, Auer (timber framing) | corte, encaixe, espiga, furo, rasgo em viga | sim, 5-eixos | 6-7 | Baixo (timber/CLT, nicho) |
| **WoodWOP MPR / MPRX** | Homag / Weeke | Texto proprietário | Parcial — "FILE-Description (MPR-Format)" circula como PDF não-oficial | Homag Venture, BMG, Weeke BHX/BHP | furo, rasgo, pocket, recorte 2D, contorno | sim (MPRX), nem todo no MPR | 7 (MPR) / 9 (MPRX) | Médio-alto |
| **CIX / BPP** | Biesse | Texto proprietário | **Não documentado publicamente** — engenharia reversa via [BppLib](https://github.com/viachpaliy/BppLib) e ONGAA CAM | Biesse Rover, Skill, Skipper, NextStep | furo, rasgo, pocket, recorte, contorno, gravação | sim (em Rover B/A 5-eixos) | 7-8 | **Altíssimo (BR)** |
| **TCN** | TPA / Felder / Vitap / Brema | Texto proprietário | Parcial — TpaCAD docs internas | Format4, Felder Profit, Vitap Point, Brema Eko | furo, rasgo, pocket, contorno | sim em algumas | 7 | Médio |
| **PGM / PGMX (Xilog Plus)** | SCM Group | ISO + macros | Não documentado publicamente | SCM Morbidelli Author/N/X, Pratix, Tech | furo, rasgo, pocket, recorte, ISO genérico | sim (Author 5-eixos) | 7-8 | **Alto (BR)** |
| **F4G** | Felder Group / Format4 | G-code-like | Não documentado | Felder Profit H08/H150/H200/H250 | recorte, furação, contorno | parcial | 6 | Médio |
| **NC-Hops** | Hexagon (Cabinet Vision) | Intermediário | Não — proprietário | "ponte" Cabinet Vision → AlphaCam → várias máquinas | tudo que o AlphaCam consumir | sim | 8 | Baixo (raramente pedido direto) |
| **IDX** | imos AG | Proprietário interno | Não público | imos iX CAMCenter (workflow fechado) | mobiliário completo | sim | 9 | Muito baixo |
| **DXF 2D nesting** | Autodesk (aberto) | CAD 2D | Sim | Nesting routers genéricos (chinesas, KDT, Bestin) | só recorte 2D + furos como círculo | não | **1-2** | Alto (entrada) |

> Notas: Felder Profit moderno (F4Integrate) também aceita G-code direto, então um exporter G-code limpo já cobre parte do parque Felder. Schemas marcados "não documentados publicamente" significa que NÃO devemos inventar specs — qualquer suporte deve ser feito por engenharia reversa de arquivos reais ou licença com o vendor.

---

## 2. Top-3 recomendação para Ornato

### 1º — DXF 3D com camadas convencionais (entrada barata, cobertura enorme)
- **Por quê:** DXF é aberto, qualquer CAM digere, e a maioria das nesting routers chinesas + KDT + Bestin que dominam o entry-level brasileiro consomem DXF direto.
- **Convenção a adotar (compatível com AlphaCam/Enroute):** uma camada por operação, nomeada `OP_<tipo>_<diam>_<prof>`:
  - `CUT_OUTER` (recorte externo, passante)
  - `CUT_INNER_<prof>` (recorte interno parcial)
  - `DRILL_<diam>_<prof>` (furo — círculo no centro)
  - `POCKET_<prof>` (rebaixo — polilinha fechada)
  - `GROOVE_<largura>_<prof>` (rasgo — linha)
  - `ENGRAVE` (gravação V)
- **Esforço:** ~2 semanas (já temos a geometria 3D; basta projetar polilinhas por face e tagear camadas).
- **ROI:** cobre 60-70% do parque BR de pequenas/médias marcenarias.

### 2º — Biesse CIX (mercado pesado BR)
- **Por quê:** Biesse Rover/Skill são as máquinas mais comuns em médio/grande porte no Brasil. Sem CIX/BPP, perdemos clientes premium.
- **Como atacar sem doc oficial:**
  1. Coletar ~30 arquivos `.cix` reais de clientes Ornato (de bSolid/BiesseWorks).
  2. Usar [BppLib](https://github.com/viachpaliy/BppLib) (MIT, C#) como base — porta para Node.
  3. Validar round-trip: gerar CIX → abrir no bSolid → confirmar geometria.
- **Escopo MVP:** macros BG (furo), BX (rasgo), BORING+ROUTING; deixar 5-eixos para v2.
- **Esforço:** 6-8 semanas (alto risco de macros não documentadas).
- **ROI:** muito alto, diferencial competitivo.

### 3º — BTLX (futuro, timber/madeira maciça)
- **Por quê:** único formato XML aberto sério da indústria, schema versionado (v2.3.1 jul/2025), suporta 5-eixos. Posiciona Ornato em CLT/timber framing/casas de madeira que está crescendo.
- **Esforço:** 4-5 semanas — XSD oficial gera bindings automáticos.
- **ROI:** baixo no curto prazo, alto valor de imagem ("Ornato exporta padrão aberto da indústria").

---

## 3. Mapping operações Ornato → cada formato

| Operação Ornato (UPM) | DXF 3D (camada) | BTLX (Processing) | CIX/BPP Biesse (macro) | WoodWOP MPR (token) |
|---|---|---|---|---|
| `hole` (furo redondo passante/cego) | círculo em `DRILL_<d>_<p>` | `Drilling` (ProcessID 22) | `BG` (Boring General) | `Bohrung` / variável `BO` |
| `pocket` (rebaixo retangular) | polilinha fechada em `POCKET_<p>` | `Pocket` (custom contour) | `ROUTM` (Routing macro) ou `BX` para ranhuras simples | `Tasche` (`HC` con `KP/KL`) |
| `groove` (rasgo passante/parcial) | linha em `GROOVE_<w>_<p>` | `Lap` ou `Slot` | `BX` (Boring Slot) | `Nut` / `NS` |
| `cutout` (recorte interno) | polilinha em `CUT_INNER_<p>` | `Cut` + contour | `ROUTM` com correção de raio | contorno KP+KL+KA com tipo F |
| `outline` (recorte externo passante) | polilinha em `CUT_OUTER` | `JackRafterCut` ou `Cut` | `ROUTM` passante (Z = espessura+over) | contorno externo, atributo "passante" |
| `engrave` (gravação V) | polilinha em `ENGRAVE` | `Marking` (ProcessID 50) | `INC` (Incision) | `Gravur` |
| `chamfer 5-axis` (chanfro) | **não suporta nativo** | `JackRafterCut` com ângulo | macro 5-eixos (`ROUTM` + cabeçote A/C) | `5AchsBohrung` (MPRX só) |

---

## 4. Risk areas (onde a conversão quebra)

1. **5-eixos / cabeçote inclinado:** DXF 2D não tem; MPR clássico não tem; CIX/MPRX/BTLX têm, mas a descrição do vetor de ferramenta (A/C ou IJK) varia entre vendors. **Risco alto** de exportar geometria correta mas inalcançável pela máquina específica.
2. **Sentido de aproximação (lead-in/lead-out):** Ornato hoje não modela isso. Em CIX/MPR exportar sem lead-in pode marcar a peça. Precisa ser sintetizado pelo exporter (linha tangente ou arco).
3. **Compensação de raio de ferramenta:** UPM declara "linha de corte" — em CIX/MPR é comum exportar centro de ferramenta com offset explícito. Erro de sinal (esquerda/direita) corta peça menor.
4. **Furos em borda (lateral):** UPM tem `face: edge_left/right/...`. Em DXF 3D vira camada `DRILL_EDGE_<face>`; em CIX é macro `BG` com vetor de aproximação `XS/YS/ZS` diferente; em MPR usa `BO` com `RI` (lado). **Mapping não-trivial.**
5. **Furos passantes vs cegos:** Ornato sabe; DXF 2D perde a info se só usar círculo (precisa do nome de camada para profundidade).
6. **Unidades & datum:** BTLX usa sistema de coordenadas da viga (X ao longo da peça); CIX/MPR usam canto da peça apoiada. Erro de datum = tudo espelhado.
7. **Multi-tool / trocas:** UPM não modela ordem ótima. Exporter precisa agrupar por ferramenta (todos furos Ø8, depois Ø10, etc) ou a máquina troca toda hora.
8. **Macros proprietárias não documentadas:** CIX tem macros que aparecem em arquivos reais sem doc (ex.: `XNC2`, `BHX`). Saída segura: limitar v1 a `BG`, `BX`, `ROUTM`.

---

## 5. Exemplo concreto — furo Ø8, profundidade 12 mm, face topside (topo da peça)

**Peça:** painel 600×400×18 mm, furo no centro (X=300, Y=200), face superior, vertical, cego.

### UPM JSON (atual Ornato)
```json
{
  "operation": "hole",
  "face": "top",
  "x": 300,
  "y": 200,
  "diameter": 8,
  "depth": 12,
  "through": false
}
```

### BTLX (Processing element, simplificado)
```xml
<Drilling ReferencePlaneID="3" Priority="0">
  <StartX>300.000</StartX>
  <StartY>200.000</StartY>
  <Angle>0.0</Angle>
  <Inclination>90.0</Inclination>
  <Diameter>8.0</Diameter>
  <DepthLimited>yes</DepthLimited>
  <Depth>12.0</Depth>
</Drilling>
```

### CIX / BPP (Biesse, macro BG)
```
BEGIN MACRO
  NAME=BG
  PARAM,NAME=SIDE,VALUE=0
  PARAM,NAME=CRN,VALUE=1
  PARAM,NAME=X,VALUE=300
  PARAM,NAME=Y,VALUE=200
  PARAM,NAME=Z,VALUE=12
  PARAM,NAME=DP,VALUE=12
  PARAM,NAME=DIA,VALUE=8
  PARAM,NAME=THR,VALUE=NO
END MACRO
```
> SIDE=0 = face superior; CRN=1 = canto inferior-esquerdo como datum.

### DXF 3D (camadas)
```
0
LAYER
2
DRILL_8_12_TOP
0
CIRCLE
8
DRILL_8_12_TOP
10
300.0
20
200.0
30
18.0
40
4.0
```
> Círculo de raio 4 (Ø8), Z=18 (face topo), camada codifica diâmetro/profundidade/face.

### WoodWOP MPR (referência, sintaxe simplificada)
```
<100 \Bohrung vertikal\
BO,"",1,300,200,12,8,0,0,"",0,"",0,0,"",0,0,0,0,0
```
> BO = boring vertical; campos: id, x, y, profundidade, diâmetro, lado=0(top).

---

## Fontes

- [BTLX schema oficial v2.3.1 — design2machine.com](https://www.design2machine.com/btlx/schema.html)
- [BTLX overview — Lignocam](https://lignocam.com/btlx/?lang=en)
- [COMPAS Timber — BTLX API (open source)](https://gramaziokohler.github.io/compas_timber/0.4.0/api/generated/compas_timber.fabrication.BTLx.html)
- [WoodWOP MPR FILE-Description (PDF, não-oficial)](https://docplayer.net/37416293-Woodwop-file-description-mpr-format-woodwop-postprocessor.html)
- [Homag woodWOP versions](https://www.homag.com/en/software/woodwop-versions)
- [BppLib — biblioteca aberta CIX/BPP (GitHub, MIT)](https://github.com/viachpaliy/BppLib)
- [Autodesk HSM post processor — Biesse CIX](https://cam.autodesk.com/posts/post.php?name=biesse+cix)
- [bSolid CIX processing guide (Scribd)](https://www.scribd.com/document/880698170/BSolid-Version)
- [TpaCAD / TCN — TPA SpA](https://www.tpaspa.com/tpacad)
- [SCM Xilog Plus — WOOD TEC PEDIA](https://wtp.hoechsmann.com/en/lexikon/11345/scm_xilog_plus)
- [PolyBoard CNC integrations (.f4g, .tcn, .xxl, .pgm)](https://wooddesigner.org/help-centre/polyboard-cnc-integration/)
- [Using DXF as CNC input — WoodWeb](https://woodweb.com/knowledge_base/Using_DXF_Files_as_CNC_Control_Input.html)
- [imos iX CAMCenter](https://www.imos3d.com/en/products/design-order/ix-cad-1/)
- [Felder Format4 CNC machines](https://www.felder-group.com/en-us/products/cnc-machine-centers-c1953)
