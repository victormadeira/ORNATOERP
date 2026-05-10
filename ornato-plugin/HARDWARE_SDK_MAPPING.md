# Hardware SDK Mapping — 151 .skp Ornato → SDK Oficial Fabricante

**Data:** 2026-05-10  
**Escopo:** substituir os 151 .skp de hardware da biblioteca legada (origem WPS, risco legal de redistribuição) por equivalentes oficiais. Universo: `ferragens/` (64), `puxadores/` (59), `acessorios/` (28).

---

## 1. SDKs investigados — sumário de viabilidade

| Fabricante | Portal | Formato `.skp` direto? | Cobertura no nosso catálogo | Licença / TOS |
|---|---|---|---|---|
| **Blum** | 3D Warehouse oficial + E-Services + CAD/CAM Service | ✅ SIM (oficial) | Dobradiças, corrediças Movento/Tandembox, Aventos | 3D Warehouse General License: distribuição comercial OK em Combined Works (projetos), redistribuição agregada exige consentimento Trimble |
| **Hettich** | hettich.com/services/hettich-cad + 3DFindIt + TraceParts | ❌ não nativo (DWG, STEP, IGES, 3DS, MAX, SAT) | Sensys, Quadro, InnoTech | TraceParts/3DFindIt convertem p/ SKP via plug-in; uso projetual OK, redistribuição agregada ❓ confirmar |
| **Häfele** | hafele.com/info/services + biblioteca 40 mil itens | ❌ DWG/3DS/STEP (não SKP nativo) | Minifix, Rafix, suportes prateleira, pés niveladores, kit LED | TOS exige conta; uso interno em projetos OK, integrador deve confirmar redistribuição |
| **FGV / FGVTN** (BR) | fgvtn.com.br + GrabCAD + 3D Warehouse | ⚠️ via GrabCAD/3DWH (uploads de terceiros, não oficial fabricante) | Corrediças telescópicas H45 | GrabCAD CC-BY/CC0 conforme upload; verificar item a item |
| **Salice** | salice.com Technical Services | ❌ só 2D AutoCAD direto; SKP só via 3D Warehouse 3rd-party | Air, dobradiças premium | Apenas 2D oficial → não recomendado p/ substituição imediata |
| **Grass** | grass.eu + TraceParts | ❌ STEP/IGES via TraceParts | Nova Pro corrediças | TraceParts TOS: uso CAD interno OK |
| **Zen Design** (BR) | zendesign.com.br/sketchups | ✅ SIM (.skp em RAR oficial gratuito) | Bali, Beetle, Cup, Fune, Orion, Shell, Sorento — 100% match com `puxador_zen_*` | Site oferece download livre p/ projetistas; bem alinhado com nosso uso |
| **Galla** (BR) | sem SDK público claro | ❓ confirmar | `puxador_galla_*` (10 itens) | Se não tiver SDK, modelar do zero |
| **Italy Line** (BR) | italyline.com.br + 3D Warehouse (uploads) | ⚠️ via 3DWH (não oficial dedicado) | Coleção Inspira | Verificar caso a caso |

---

## 2. Mapa 151 itens → SDK fabricante (resumo por bucket)

### Ferragens (64 itens)

| Bucket | Itens originais | Equivalente oficial | Esforço | Status legal |
|---|---|---|---|---|
| **Dobradiças "amor/sem amor" copo 35mm** (≈22 itens: `dobradica_amor_*`, `dobradica_sem_amor_*`, 165°, calço duplo, canto reto, canto L, porta espessa, curva) | Blum CLIP top BLUMOTION 110°/155°/165° + 95° canto reto + 110° canto L | Blum 3D Warehouse `.skp` direto | ✅ download direto | OK |
| **Corrediças telescópicas** (`corredica_telescopica*`, light, inox, com amortecedor, distanciador — 7 itens) | FGV TN H45 + Hettich Quadro como alternativa | FGV via GrabCAD/3DWH (oficial PT-BR); Hettich via TraceParts → SKP | ✅ download / ⚠️ converter STEP | OK / verificar |
| **Corrediças ocultas slowmotion / extensão total** (4 itens) | Blum Movento + Tandem | Blum 3D Warehouse (.skp oficial — ex. "Blum Movento ALL detailed") | ✅ download direto | OK |
| **Corrediça sobreposta** (1) | FGV / Hettich econômica | GrabCAD | ✅ download | verificar |
| **Minifix + cavilha** (3 itens cj) | Häfele Minifix 15/19 + cavilha 8mm | Häfele CAD lib STEP → converter | ⚠️ converter STEP→SKP | OK uso interno |
| **Rafix simples e duplo** (2) | Häfele Rafix Tab 20 | Häfele CAD STEP → converter | ⚠️ converter | OK |
| **Suportes prateleira** (`suporte_prateleira_*`, `suporte_pino_*`, maori, cadeirinha, uniblock — 14 itens) | Häfele linha "Connectors and Shelf Supports" + códigos F1109/F1112 já alinham com Häfele PIM | Häfele STEP / 3DFindIt | ⚠️ converter | OK |
| **Parafusos & cantoneiras & pinos** (≈12 itens) | Genéricos — modelar primitivos do zero (cilindro+rosca esquemática) | — | 🔨 modelar zero (15 min/item) | sem TOS |
| **IxConnect / Uniblock** (3) | Häfele Ixconnect oficial | Häfele PIM STEP | ⚠️ converter | OK |

### Puxadores (59 itens)

| Bucket | Itens | Equivalente oficial | Esforço | Status legal |
|---|---|---|---|---|
| **Linha Zen** (`puxador_zen_*` — 14 itens: bali_granado, beetle, cup_ponto, fune, orion g/m/p, shell, sorento + variantes) | Zen Design BR — biblioteca oficial SKP | ✅ ZIP `.skp` em zendesign.com.br/sketchups | ✅ download direto | ✅ uso projetual livre |
| **Linha Galla** (`puxador_galla_*` — 10 itens: 96/128/160/192/256/352mm + horizontal/vertical/duplo) | Galla (BR) — sem SDK público claro | ❓ contatar fabricante; alternativa: modelar do zero (puxador é tubo + base — 30 min/item) | 🔨 modelar zero | n/a |
| **Linhas Hardt, Nazca, Reale, Veneza** (16 itens) | Linhas brasileiras genéricas — em geral revendidas por Italy Line, Brax, Mavi | Buscar 3D Warehouse coleção "Mavi/Brax"; senão modelar | ⚠️ verificar / 🔨 modelar | OK projetual |
| **Concha + Goccia + Facetato** (12) | Brasileiros — modelar do zero (geometria simples extrusão) | — | 🔨 modelar zero (45 min/item) | sem TOS |
| **Gola com/sem ponteira** (3) | Perfil de alumínio — modelar como extrusão paramétrica | — | 🔨 modelar zero | sem TOS |
| **Furação genérica + "sem puxador"** (4) | Geometria auxiliar — manter como está, sem licença em jogo | — | ✅ manter | n/a |

### Acessórios (28 itens)

| Bucket | Itens | Equivalente oficial | Esforço | Status legal |
|---|---|---|---|---|
| **Pés niveladores plástico/alumínio** (4) | Häfele "Levelling feet" PIM | STEP→SKP | ⚠️ converter | OK |
| **Sapateiras + porta-latas + tulha (oculta/telescópica)** (12) | Hardware: corrediças já mapeadas (Blum/FGV); chassis = modelar | 🔨 modelar chassis (1-2h cada) | parcial | n/a chassis |
| **Tampos vidro** (4) | Geometria simples — modelar plano + bisel | — | 🔨 modelar zero (10 min) | n/a |
| **Máscaras puxador, fixação frente, kit desempenador, estrutura rodapé** (8) | Genéricos / auxiliares | — | 🔨 modelar zero | n/a |

---

## 3. Top 30 prioritários (regra 80/20)

Cobrem ~80% dos projetos de marcenaria BR:

1–8. **Blum CLIP top BLUMOTION 110°** — reta / canto reto / canto L / porta espessa (4 variantes × 2 com/sem amor)  
9–10. **Blum CLIP top 155° / 165°** (porta sobreposta dupla)  
11–13. **Blum Movento slowmotion** + extensão total + Tandem oculta  
14–17. **FGV TN H45 telescópica** 35/45/50/55cm  
18. **FGV telescópica c/ amortecedor**  
19. **Hettich Quadro 4D** (alternativa premium)  
20. **Häfele Minifix 15** + cavilha 8mm  
21. **Häfele Rafix Tab 20**  
22–24. **Häfele suporte prateleira F1109NI / F1112NI / pino metálico 5mm**  
25. **Häfele Ixconnect SC8/25**  
26. **Häfele pé nivelador plástico** + variante alumínio  
27–30. **Zen Design**: Sorento, Orion, Shell, Cup (4 puxadores mais vendidos da linha)

→ **Pacote Top 30 = 100% obtenível via download direto/STEP em 1 semana.**

---

## 4. Bucket "modelar do zero" (≈55 itens)

Sem equivalente público confiável — geometria simples, projetar internamente:

- **Puxadores Galla** (10 itens) — tubo + base, 30 min/item = 5h
- **Puxadores Hardt/Nazca/Reale/Veneza** (16) se não achar no 3DWH Mavi/Brax — 45 min/item = 12h
- **Concha/Goccia/Facetato/Gola** (15) — extrusão simples, 30–45 min = 10h
- **Parafusos/cantoneiras/pinos auxiliares** (12) — primitivos, 15 min = 3h
- **Chassis sapateira/tulha/porta-latas** (10) — 1–2h cada = 15h
- **Tampos vidro / máscaras / estruturas auxiliares** (12) — 10–20 min = 3h

**Total estimado:** ~50 horas de designer 3D = **2 semanas em tempo integral** ou 4 semanas part-time.

---

## 5. Plano de execução em 3 fases

### Semana 1 — Top 30 SDK oficiais
- Baixar pacote Blum 3D Warehouse oficial (dobradiças + Movento + Tandem) — 12 itens, ~2h
- Baixar Hettich + Häfele via TraceParts/3DFindIt em STEP, conversão em batch via SketchUp Pro (importador STEP nativo desde 2021) — 14 itens, ~6h
- Baixar Zen Design SketchUps oficiais (RAR) — 4 itens, ~30 min
- QA: validar escala (mm), origem do bloco, layer tagging, vincular ao `catalog.json`

### Semana 2 — Brasileiros e acessórios
- Tentar contato direto **Galla** + **Italy Line** + **Mavi/Brax** solicitando SDK SketchUp (muitos têm sob demanda p/ projetistas cadastrados)
- Vasculhar 3D Warehouse coleção "Máxima Ferragens e Mavi Puxadores" (já existe, oficial das marcas) p/ Hardt/Nazca/Reale/Veneza
- Converter Häfele restantes (suportes, niveladores, IxConnect)
- Total estimado: 30 itens, ~16h

### Semana 3 — Bucket "modelar do zero"
- Designer interno ou freelance (ver §7) cobre os ~55 restantes
- Priorizar: puxadores Galla → chassis sapateiras → auxiliares
- ~50h de modelagem

**Marco final:** todos os 151 itens substituídos por fontes oficiais ou modelagem própria, eliminando dependência WPS.

---

## 6. Tabela de licenças — resumo

| Fabricante | Uso em projeto cliente | Redistribuir agregado dentro de plug-in comercial | Atribuição |
|---|---|---|---|
| Blum (3D WH oficial) | ✅ permitido | ⚠️ "Combined Works" sim; agregação pura exige consentimento Trimble (escrever a `3dwarehouse-tou@sketchup.com`) | recomendada |
| Hettich CAD | ✅ permitido | ❓ confirmar c/ jurídico Hettich BR | sim |
| Häfele PIM | ✅ permitido (login conta) | ❓ confirmar TOS Häfele | sim |
| FGV / FGVTN | ✅ (uploads do próprio fabricante em GrabCAD) | ⚠️ verificar | recomendada |
| Zen Design | ✅ download público p/ projetistas | ✅ aparente livre p/ projetistas BR | recomendada |
| Salice | só 2D oficial; SKP via 3DWH 3rd-party | ❌ não recomendado | n/a |
| Grass / TraceParts | ✅ uso projetual | ⚠️ TraceParts TOS proíbe agregação | sim |
| Modelagem própria | ✅ total | ✅ total (IP Ornato) | n/a |

**Recomendação jurídica:** redigir e enviar e-mail formal a Trimble (3dwarehouse-tou) + Hettich BR + Häfele BR explicando o uso (plug-in interno SketchUp p/ marcenarias clientes) e pedindo consentimento por escrito antes de embarcar os SKP no instalador. Custo zero, prazo ~10 dias.

---

## 7. Recomendação final — designer 3D freelance BR

Para o bucket "modelar do zero" (~50h), três opções investigáveis no LinkedIn/Behance especializadas em modelagem de móveis SketchUp:

1. **Autocriativo (Curitiba/PR)** — autocriativocursos.com.br: comunidade e curso "SketchUp para Móveis e Marcenaria"; tem rede de alunos avançados disponíveis para freelances pontuais. **Buscar em "freelas SketchUp marcenaria" no FB do Autocriativo**.
2. **Casoca / Sketchup Texture** — casoca.com.br já distribui blocos 3D oficiais Zen/Italy Line; muitos modeladores cadastrados aceitam projetos sob demanda.
3. **3D Warehouse "Máxima Ferragens e Mavi Puxadores"** (organização oficial) — perfil com modelador interno; vale contatar diretamente para terceirizar puxadores Galla/Hardt/Nazca em pacote.

**Estimativa orçamentária:** R$ 40–80/item BR × 55 itens = **R$ 2.200 a R$ 4.400 total**, prazo 2–3 semanas, entrega .skp + thumbnail + JSON metadata pronto p/ `catalog.json`.

---

## Fontes consultadas

- Blum 3D Warehouse oficial — https://www.blum.com/us/en/services/e-services/softwarepartners/3d-warehouse/
- Blum Movento detailed — https://3dwarehouse.sketchup.com/model/8fd99188-5d0e-4c2b-915b-a58b9be61088
- Blum CAD/CAM Service — https://www.blum.com/eu/en/services/industrial-production/cad-cam-dataservice/
- Hettich CAD Downloads — https://www.hettich.com/en-no/services/hettich-cad/cad-downloads
- Hettich Sensys via 3DFindIt — https://www.3dfindit.com/en/cad-bim-library/manufacturer/hettich
- Häfele Design Tools — https://www.hafele.com/us/en/info/services/project-planning-and-customization/design-tools/143861/
- Häfele CAD config — https://www.haefele.de/en/info/service/cad-configuration-tools/406/
- FGVTN — https://www.fgvtn.com.br/produto/corredica-telescopica-fgvtn-h45
- FGV GrabCAD — https://grabcad.com/library/corredica-telescopica-fgvtn-400mm-h45-1
- Zen Design SketchUps (oficial BR) — https://www.zendesign.com.br/sketchups
- Zen Design downloads — https://www.zendesign.com.br/downloads/
- Italy Line — https://italyline.com.br/lancamentos-puxadores/
- Salice Technical Services — https://www.salice.com/ww/en/company/technical-services
- Máxima/Mavi org 3DWH — https://embed-3dwarehouse-classic.sketchup.com/org/7b4b077c-dd61-4334-a84c-f820c2b567b5
- 3D Warehouse TOS — https://3dwarehouse.sketchup.com/tos/
- 3DWH TOS FAQ — https://help.sketchup.com/en/3d-warehouse/3d-warehouse-terms-use-faq
- Autocriativo — https://www.autocriativocursos.com.br/cursodesketchupparamoveisemarcenariaautocriativo
- TraceParts Hettich — https://www.traceparts.com/en/search/hettich-marketing-und-vertriebs-gmbh-co-kg-hinges
