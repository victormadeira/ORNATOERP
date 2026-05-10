# BENCHMARK — Ornato vs Concorrentes BR (Promob, Gabster, Mobplan/Cut Pro, Dinabox, UPMobb)

**Data de pesquisa:** 2026-05-10 · **Escopo:** mercado brasileiro de software para marcenaria PME · **Foco:** SketchUp-based vs motor próprio. Não cobre Cabinet Vision/SketchList (R2).

Fontes principais: promob.com, gabster.com.br, dinabox.net, suporte.promob.com, capterra.com, voltsoftwares.com, krsofts.com.br, fimma.com.br, emobile.com.br, mobcloud.com.br (consulta 2026-05-10).

---

## 1. Tabela comparativa (12 dimensões)

Legenda: ✅ pleno · 🟡 parcial · ❌ ausente · ❓ não confirmado em fonte pública.

| Dimensão | Ornato (hoje) | Promob Plus Enterprise | Gabster | Mobplan / Promob Cut Pro | Dinabox | UPMobb |
|---|---|---|---|---|---|---|
| **Catálogo (qtd módulos)** | 388 .skp + 47 JSON paramétricos curados | "milhares" pré-configurados (sem nº oficial) | 500+ módulos paramétricos | N/A (corte/nesting only) | catálogo livre criado pelo cliente + sementes | ❓ |
| **Paramétrico real** | ✅ JSON com expressões (`{w}`, `{h}`, `{n_dobradicas}`) + ShopConfig | ✅ Construtor de armários + configurador dimensões | ✅ "500+ módulos paramétricos" | ❌ | ✅ componentes dinâmicos SketchUp | 🟡 |
| **Detecção automática de ferragens** | ✅ `ferragens_auto` + regras (12 hardware rules + RulesEngine) | ✅ regras nativas | ✅ kits ferragem por módulo | ❌ | 🟡 biblioteca de ferragens manual | 🟡 |
| **Detecção de colisão entre furos** | ✅ `DrillingCollisionDetector` (XY + profundidade) | ❓ não documentado publicamente | ❓ | ❌ | ❓ | ❌ |
| **Posicionamento automático Sys32** | ✅ ShopConfig.sys32 + JSONs com sys32 desligável | ✅ via Plus Enterprise | ✅ | ❌ | 🟡 | 🟡 |
| **Render fotorrealista** | ❌ (depende de plugins terceiros do SketchUp) | ✅ Real Scene 2.0 + Real Scene AI (4K com IA) | ✅ render cloud nativo | ❌ | 🟡 SketchUp + plugins | ❓ |
| **Preview cliente (apresentação)** | ❌ (sem viewer dedicado) | ✅ VR + 360° + apresentação dedicada | ✅ link cloud para cliente | ❌ | 🟡 | ❓ |
| **Plano de corte / nesting** | 🟡 `cut_optimizer.rb` condicional (não no dev_loader) | ✅ Cut Pro (DXF nesting, 4 modos otimização) | ✅ via integração | ✅ Cut Pro = referência do mercado | ✅ PCP integrado | 🟡 |
| **Pós-processador CNC** | ✅ UPM JSON → ERP gera G-code (custom) + edge_left/right/front/back | ✅ DXF + plugins por fabricante de router | 🟡 via integração externa | ✅ DXF + plugins router | ✅ "integração direta com CNC" | 🟡 |
| **Integração ERP nativa** | ✅ próprio (Ornato ERP) — `export_to_erp`, `erp_push_bom`, `erp_create_proposal` | 🟡 Focco ERP (Cyncly) + integradores | 🟡 integradores parceiros | ❌ | ✅ ERP DinaBox próprio (CRM, financeiro, PCP) | ✅ |
| **Multi-usuário / cloud** | ❌ workstation only (`Sketchup.write_default`) | 🟡 backup cloud (Enterprise) | ✅ plataforma cloud nativa | 🟡 | ✅ cloud + multi-user | ❓ |
| **Preço típico (BR)** | interno (não comercial ainda) | R$ 1.255 (Plus 2025 vitalícia em revenda) a R$ 4-6k full Enterprise + Cut Pro + Real Scene; assinatura mensal Pro | sob consulta (assinatura mensal) | R$ 349 Cut Pro avulso a R$ 1.100 (Mobcloud Cut Assistant); Corte Certo R$ 99-399/mês | sob consulta + plano free | sob consulta |

**Notas:** preços de Promob são licenças vitalícias de revendedores autorizados (Volt, KR Softs, Rocha, 7Seven). Promob lançou em 2024 modelo de assinatura mensal/anual para o Plus Professional ([eMóbile](https://emobile.com.br)). Gabster e Dinabox não publicam tabela.

---

## 2. Cinco features que concorrentes têm e Ornato NÃO

1. **Render fotorrealista nativo com IA** — *Promob Real Scene 2.0/IA*: render 4K em tempo real, créditos mensais inclusos, qualidade que confunde com foto. Ornato hoje depende de V-Ray/Enscape externos. ([Real Scene IA](https://suportepromob.zendesk.com/hc/en-us/articles/32908893222931))
2. **Apresentação ao cliente em VR + 360°** — *Promob Plus Professional* e *Gabster*: link cloud com tour 360 e VR para fechamento de venda. Ornato não tem viewer cliente.
3. **Cloud multi-usuário com sync de catálogo** — *Gabster* e *Dinabox 2.0*: catálogo compartilhado entre projetistas, versionamento, acesso web. Ornato é workstation-bound (`Sketchup.write_default('Ornato', ...)`).
4. **Construtor de armários flexível com modelo construtivo configurável pela marcenaria** — *Promob Maker / Plus Enterprise*: cada loja define seu padrão construtivo e propaga em todos os módulos. Ornato tem ShopConfig (boa base) mas sem editor visual de "modelo construtivo" no nível Maker.
5. **Otimização de nesting com 4 modos + DXF pronto pra router** — *Promob Cut Pro*: standard, larger-to-smaller, smaller-to-larger, random; agrupa peças idênticas; gera DXF nativo. Ornato tem `cut_optimizer.rb` mas (a) está fora do `dev_loader`, (b) não exporta DXF, depende do ERP.

---

## 3. Três features onde Ornato pode SUPERAR com pouco esforço

1. **Furação preservada de .skp WPS (etapa 4 do PIPELINE_FURACOES_3D)** — concorrentes regeneram furos por regra; Ornato lê a geometria 3D real do componente WPS (388 modelos com furação modelada). Quando `SkpFeatureExtractor` for plugado no exportador UPM, Ornato terá fidelidade de furação superior a Promob/Gabster, que usam apenas regras paramétricas. **Esforço:** 1-2 sprints (código já existe parcial).
2. **Detecção de colisão entre furos com tolerância XY+profundidade** — Promob/Gabster não publicam essa funcionalidade. Ornato já tem `DrillingCollisionDetector` rodando. Bastaria expor relatório no UI v2 (`tab usinagens/validacao`) para virar diferencial vendável: "Ornato impede sua CNC de colidir furos".
3. **ERP nativo end-to-end (proposta → BOM → G-code) sem integradores** — Promob precisa Focco/parceiros; Gabster idem. Ornato já tem `erp_push_bom`, `erp_create_proposal`, `export_to_erp` em 1 callback Ruby. Falta empacotar como pitch comercial: "do projeto ao G-code em 1 clique, sem 2ª licença".

---

## 4. Roadmap proposto — 90 dias para fechar gaps críticos

### Sprint 1 (dias 1-30) — Tampar buracos de produção
- **Wiring v2 → Ruby**: integrar UI v2 ao bridge HtmlDialog (hoje zero matches em `.rb`). Conectar tabs `biblioteca/usinagens/producao` aos 46 callbacks existentes. Sem isso, UX nova fica de fachada.
- **Mapping de materiais** (bug bloqueante do AUDIT_BIBLIOTECA): 9/9 IDs `MDF{esp}_{cor}` não resolvem em `catalogo_materiais.json`. Criar tabela de aliases.
- **Pipeline furações 3D etapa [4]**: terminar `SkpFeatureExtractor` → emitir UPM ops a partir das ferragens .skp. Diferencial competitivo direto.
- **Plugar `cut_optimizer.rb` no dev_loader** + export DXF mínimo (paridade básica com Cut Pro).

### Sprint 2 (dias 31-60) — Render + apresentação
- **Render**: integrar SketchUp PBR rendering ou parceria com Enscape/D5 (caminho mais rápido que motor próprio); empacotar como "Ornato View".
- **Link cliente cloud-lite**: gerar HTML estático com 3D viewer (three.js export do .skp via `model.export :glb`) + fotos de catálogo. Não precisa cloud full — só CDN. Fecha gap "preview cliente" sem migrar para SaaS.
- **Relatório de colisão de furos** no tab `validacao` (vira screenshot pra marketing).

### Sprint 3 (dias 61-90) — Multi-user e go-to-market
- **Cloud sync de ShopConfig + catálogo**: começar com Git-backed JSONs + WebDAV/S3 (não precisa virar SaaS multitenant agora). Promob Enterprise faz "backup na nuvem" — paridade nominal.
- **Preencher 151 .skp órfãos** (ferragens/puxadores/acessórios) com JSONs paramétricos — fecha gap de catálogo.
- **Preço comercial**: posicionar abaixo de Promob Enterprise+Cut+Real Scene (R$ 4-6k vitalício) com mensalidade tipo Cerne ERP.

---

## 5. Score executivo (Ornato hoje, 1-10)

| Área | Score | Justificativa |
|---|:---:|---|
| Catálogo / biblioteca | **7** | 388 .skp íntegros, 47 JSONs curados; 151 .skp sem JSON paramétrico (39% subutilizado) |
| Engine paramétrica | **8** | JSONModuleBuilder + ShopConfig + 12 hardware rules; arquitetura sólida |
| Detecção de ferragens / colisão | **9** | Diferencial real vs concorrentes (DrillingCollisionDetector + FerragemDrillingCollector) |
| Furação 3D (preservar WPS) | **6** | Etapas 1-3 prontas; etapa [4] (extrator) ⏳ — quando fechar, vira **9** |
| Render fotorrealista | **2** | Sem nada nativo; depende de terceiros |
| Preview / apresentação cliente | **2** | Inexistente |
| Plano de corte / nesting | **4** | Código existe mas fora do loader; sem DXF nativo |
| CNC pós-processador | **7** | UPM JSON + 8 lados (incl. edges); ERP já gera G-code |
| Integração ERP | **9** | Nativa, sem 3º; Promob/Gabster precisam parceiros |
| Multi-user / cloud | **2** | Workstation only |
| UI/UX (v2) | **4** | Shell premium dos 9 tabs, mas zero callbacks Ruby — só mock |
| Testes / QA | **1** | Zero specs; só fixtures |
| **Score médio ponderado** | **5,1** | Forte em engine/colisão/ERP; fraco em render/cloud/UX/QA |

**Veredito:** Ornato tem **núcleo técnico equivalente ou superior** ao Promob Enterprise em 3 dimensões críticas (detecção de colisão, furação preservada de WPS, ERP nativo), mas perde feio em **4 dimensões comerciais** que decidem venda PME (render, apresentação ao cliente, cloud, UI funcional). Os 90 dias do roadmap miram exatamente esses 4 — sem mexer no que já é diferencial.

---

## Sources

- [Promob — site oficial](https://promob.com/promob/)
- [Promob Plus Enterprise 2026 — Soft Projetos](https://www.softprojetos.com/promob-enterprise)
- [Promob Cut Pro — Suporte](https://suporte.promob.com/hc/pt-br/articles/30703270458259-Promob-Cut-Pro-Integra%C3%A7%C3%A3o-com-m%C3%A1quinas-Router)
- [Promob Cut Pro — Nesting](https://suporte.promob.com/hc/en-us/articles/31122471473937-Promob-Cut-Pro-Nesting-Cut)
- [Promob Real Scene 2.0](https://www.promob.com/promob-real-scene2)
- [Real Scene IA — Suporte](https://suportepromob.zendesk.com/hc/en-us/articles/32908893222931)
- [Promob Plus 2025 — Volt Softwares (preços)](https://voltsoftwares.com/produto/promob-plus-2025-real-scene-2-0-cut-pro/)
- [Promob Plus 2025 + Cut Pro — KR Softs](https://krsofts.com.br/en-in/products/promob-plus-2025-cutpro-plano-de-cortes)
- [Promob lança modelo de assinatura — eMóbile](https://emobile.com.br/site/industria/promob-lanca-novo-modelo-de-comercializacao-de-software/)
- [Promob — Capterra](https://www.capterra.com/p/250886/Promob-Plus/)
- [Gabster — site oficial](https://www.gabster.com.br/)
- [Gabster — Funcionalidades do Plugin](https://suporte.gabster.com.br/hc/pt-br/articles/208274913-Funcionalidades-do-Plugin-de-Marcenaria)
- [Gabster — Assinaturas](https://gabster.com.br/categoria-produto/assinaturas/)
- [DinaBox — site oficial](https://www.dinabox.net/)
- [DinaBox — Planos e Preços](https://www.dinabox.net/planos)
- [DinaBox — ERP](https://www.dinabox.net/erp)
- [Mobcloud — Cut Assistant](https://www.mobcloud.com.br/)
- [Fimma Brasil — Softwares moveleiros](https://fimma.com.br/post/128/quais-sao-os-softwares-utilizados-na-industria-moveleira)
