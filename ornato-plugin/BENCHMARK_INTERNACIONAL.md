# Benchmark Internacional — Ornato vs Líderes Globais

**Data:** 2026-05-10 · **Agente:** R2 · **Escopo:** posicionar plugin SketchUp Ornato (paramétrico → UPM JSON → ERP → G-code) frente a 7 concorrentes mundiais. Foco: aprendizado, não competição direta no mercado USA/EU.

---

## 1. CabinetSense — atenção especial (concorrente direto SketchUp)

CabinetSense é **o único concorrente que também é plugin SketchUp**, então merece estudo profundo.

### Arquitetura
- **Host:** extensão Ruby para SketchUp (Extension Warehouse) — mesmo modelo do Ornato.
- **Paramétrico:** sistema "true parametric drawing" — o usuário define **construction method** (tipo de junção, espessura padrão, recuos) globalmente; cabinetes herdam regras automaticamente. Isto é a **hierarquia de overrides** que falta em Ornato hoje.
- **Story Stick:** layout linear primeiro (story stick = "régua de narrativa"), depois extrude para 3D. Reduz tempo de specing inicial em ~60% segundo demos no 3D Basecamp 2022.
- **Drag-and-drop + single-click dimensioning:** UX otimizada para shop floor, não engenheiro CAD.

### Export e integrações
- **DXF** como denominador comum (Vectric, Enroute, AlphaCam, MasterCam, SheetCam) — sem formato proprietário fechado.
- Sem integração Microvellum direta (Microvellum é AutoCAD/BricsCAD); confusão comum no mercado.
- Cutting list + sheet diagrams + part labels nativos.

### O que devemos copiar
1. **Construction Method como entidade global** (hoje Ornato tem regras espalhadas em config). Promover a `ConstructionMethod` first-class com herança.
2. **Story Stick UX:** modo 2D linear antes do 3D — onboarding mais rápido para marceneiro que não é designer.
3. **DXF como pivot universal** — independente de qual CAM o cliente use.
4. **Single-click dimensioning** com cotas auto-orientadas (hoje Ornato exige edição manual).

### O que NÃO copiar
- Falta cloud / colab.
- Sem rules engine para edge banding (manual).
- Sem ERP integrado — é só design tool.

---

## 2. Tabela comparativa (Ornato vs 7 concorrentes)

| Critério | **Ornato** | Cabinet Vision | CabinetSense | SketchList 3D | Imos iX | Microvellum | AlphaCam | Polyboard |
|---|---|---|---|---|---|---|---|---|
| **Schema paramétrico** | Declarativo (JSON) | Declarativo + script (UCS JS/VBScript) | Declarativo (Construction Method) | Visual/imperativo | Declarativo + scripting | Declarativo (Toolbox rules) | Imperativo (CAM) | Declarativo (Methods) |
| **Hierarquia overrides** | Parcial (global → módulo) | **Global → Job → Room → Cabinet → Part** (5 níveis) | Global → Cabinet | Apenas global | Global → Project → Element | Global → Job → Product → Part | N/A | Global → Method → Cabinet |
| **Edge banding rules engine** | Manual | **Sim, regras condicionais** | Básico | Não | Sim, avançado | Sim | N/A | Sim (Methods) |
| **Joint/connection detection** | Manual | **UCS Connections (2023+)** | Mecânico fixo | Não | Auto + manual | Auto | N/A | Auto (fitting links) |
| **Hardware library** | ~80 peças | 3000+ (Blum, Hettich, Häfele) | ~500 | <100 | 5000+ (parceria Blum direta) | 4000+ | N/A | 1500+ (Blum partner oficial) |
| **CNC post-processors** | UPM JSON custom | 200+ (ALPHACAM engine) | DXF→qualquer CAM | DXF | woodWOP, Homag iXConnect, Biesse | TPA, woodWOP, NCHops | **400+ (líder)** | woodWOP, Biesse, SCM |
| **Formato export** | UPM JSON, G-code | UCS, DXF, IGES, STEP | DXF, CSV cutlist | DXF, CutList Plus | **MPR/MPRX, BTLX, IDX, DXF-3D** | XML proprietário, DXF, NCHops | DXF, BTL/BTLx, NC1, ISO G-code | DXF, MPR, BTL, CID4 |
| **Cloud/colab** | Não (local) | Hexagon Nexus | Não | Web viewer | iXConnect cloud | Microvellum Cloud | Não | Não |
| **Open / extensível** | **Open (Ruby + JSON)** | Fechado (UCS scripts) | Fechado (Ruby fechado) | Fechado | Fechado (API parceiros) | Fechado | Fechado (post-proc abertos) | Fechado |

**Observação:** Imos iX é o único que exporta nativamente para os 4 maiores formatos industriais europeus simultaneamente.

---

## 3. Três padrões de arquitetura para Ornato adotar

### 3.1 UCS — User Created Standards (Cabinet Vision)
Cabinet Vision permite **scripts JavaScript/VBScript** que usuários finais escrevem para customizar comportamento sem tocar core. Em 2023 ganhou UCS Connections para definir junções dinamicamente. **Aplicação Ornato:** expor uma sandbox JS (ou Ruby DSL) onde marceneiro define regras de furação/edge tape sem patchear código. Hoje Ornato exige PR no repo.
> Ref: `nexus.hexagon.com/.../JavaScript_User_Created_Standards`

### 3.2 Manufacturing Methods (Polyboard)
**Methods** em Polyboard são entidades globais que encapsulam: tipo de fundo (aplicado/encaixado/rebatido), recessos, hardware fittings, espessuras. Trocar o Method de um móvel reescreve TODA a fabricação. **Aplicação Ornato:** promover `método_construtivo` a entidade first-class no UPM JSON, com herança em cascata (cliente sobrescreve global, projeto sobrescreve cliente, módulo sobrescreve projeto).
> Ref: `wooddesigner.org/polyboard-software-tools/`

### 3.3 iXConnect — interface bus (Imos)
Imos não exporta arquivos: publica eventos numa **bus de integração** (iXConnect) que máquinas Homag consomem ao vivo. **Aplicação Ornato:** o ERP já é destino do UPM JSON; expor um **broker** (Redis/SQS) onde cada CNC consome jobs por handshake, em vez do operador copiar `.nc` por pendrive. ROI alto em chão de fábrica com 2+ máquinas.
> Ref: `docs.homag.cloud/en/data-exchange/in-a-nutshell/partner`

---

## 4. Cinco formatos de export CNC para avaliar (ranqueado ROI/esforço)

| # | Formato | ROI BR | Esforço | Justificativa |
|---|---|---|---|---|
| **1** | **DXF 2D (com camadas convencionadas)** | **Alto** | **Baixo** | Padrão universal — Vectric, Enroute, AlphaCam, V-CARVE. Toda CNC importa. CabinetSense e SketchList provam que DXF "resolve 80%". Ornato pode entregar em 1 sprint. |
| **2** | **MPR/MPRX (woodWOP / Homag)** | **Alto** | **Médio** | Homag tem ~30% market share no BR mid-high. Formato XML documentado. Imos e Polyboard suportam. |
| **3** | **NCHops (Biesse)** | **Médio-Alto** | **Médio** | Biesse forte no BR (Itália → SP). Microvellum suporta. Documentação fechada mas há reverse-engineering público. |
| **4** | **BTLx 2.0** | **Médio** | **Baixo** | XML aberto (`design2machine.com`), GUID-based, modification history nativo. Foco timber/estrutural mas crescendo em furniture. Vale por ser **aberto e gratuito**. |
| **5** | **IDX (Imos / Blum CAD-CAM)** | **Baixo-Médio** | **Alto** | Hardware Blum-centric. Excelente para shops Blum-puros. Spec semi-fechada (parceria Blum). |

**Recomendação:** atacar **DXF 2D primeiro (sprint único)**, depois **MPR/MPRX** como diferencial competitivo BR.

---

## 5. Score Ornato vs líderes globais (1-10)

| Dimensão | Ornato | Líder | Líder = |
|---|---|---|---|
| Schema paramétrico | 6 | 9 | Cabinet Vision (UCS) |
| Hierarquia overrides | 4 | 9 | Cabinet Vision |
| Edge banding rules | 3 | 9 | Cabinet Vision / Imos |
| Joint detection | 3 | 8 | Cabinet Vision 2023+ |
| Hardware library | 2 | 10 | Imos (Blum direct) |
| CNC post-processors | 2 | 10 | AlphaCam |
| Formatos export | 3 | 9 | Imos iX |
| UX SketchUp | 7 | 8 | CabinetSense |
| ERP integrado | **9** | **9** | **Ornato (vantagem real)** |
| Open/extensibilidade | **9** | 9 | Ornato (Ruby+JSON aberto) |
| Cloud/colab | 2 | 8 | Hexagon Nexus |
| Localização BR (NCM, ICMS, m² laminado) | **10** | **10** | **Ornato (vantagem real)** |
| **Média** | **5.0** | **9.0** | — |

### Onde Ornato vence hoje
1. **ERP nativo** (proposta → orçamento → produção → entrega) — nenhum concorrente cobre o ciclo.
2. **Localização BR** (NCM, m² em laminado, fitas brasileiras, fornecedores locais).
3. **Open source / extensível** — JSON declarativo + Ruby plugin.

### Onde Ornato precisa fechar gap (top 3)
1. **Hierarquia de overrides 5 níveis** (copiar Cabinet Vision: Global → Cliente → Projeto → Ambiente → Módulo).
2. **Library de hardware** (parceria Blum/Hettich/Häfele BR — pelo menos catalog import via XML).
3. **DXF 2D export** universal (sprint curto, ROI gigante).

---

## Fontes

- [Cabinet Vision UCS Documentation — Hexagon Nexus](https://nexus.hexagon.com/documentationcenter/en-US/bundle/CABINET_VISION_2024_HELP/page/Tips_Tricks_FAQs/UCS/JavaScript_User_Created_Standards/JavaScript.UCS.xhtml)
- [Cabinet Vision — Hexagon](https://hexagon.com/products/product-groups/computer-aided-manufacturing-cad-cam-software/cabinet-vision)
- [CabinetSense official](https://www.cabinetsensesoftware.com/)
- [CabinetSense — SketchUp Extension Warehouse](https://extensions.sketchup.com/extension/7edd2253-d6e3-4603-9708-9ee9137b1b25/cabinet-sense)
- [SketchUp to CNC with CabinetSense — 3D Basecamp 2022](https://www.youtube.com/watch?v=WIyRCnYMO-A)
- [SketchList 3D — CNC Cabinet Software](https://sketchlist.com/cabinet/woodworking-cnc-software/)
- [Imos iX CAM — CNC Programming](https://www.imos3d.com/en/products/manufacturing-assembly/cnc-programming-ix-cam/)
- [HOMAG iXConnect Partner Documentation](https://docs.homag.cloud/en/data-exchange/in-a-nutshell/partner)
- [Microvellum Platform](https://www.microvellum.com/platform)
- [Microvellum vs Cabinet Vision Comparison](https://www.hitechcaddservices.com/news/microvellum-vs-cabinet-vision-millwork-design/)
- [AlphaCam — Hexagon](https://hexagon.com/products/product-groups/computer-aided-manufacturing-cad-cam-software/alphacam)
- [ALPHACAM xNesting](https://hexagon.com/products/alphacam-xnesting)
- [Polyboard Software Details — Wood Designer](https://wooddesigner.org/polyboard-software-tools/)
- [Polyboard / Blum Partnership](https://www.blum.com/eu/en/services/industrial-production/cad-cam-interface/software-partners/wood-designer/)
- [BTLx 2.0 Specification — design2machine](https://design2machine.com/)
- [BTLx Examples](https://design2machine.com/example-btlx/index.html)
- [Lignocam BTLx Overview](https://lignocam.com/btlx/?lang=en)
