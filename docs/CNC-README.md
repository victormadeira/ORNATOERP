# Ornato CNC — Sistema Completo de Marcenaria Industrializada

## Arquitetura

```
cnc/
├── sketchup-plugin/          # Plugin SketchUp (Ruby) — MODELAGEM
│   ├── ornato_loader.rb      # Entry point do plugin
│   ├── ornato_sketchup/
│   │   ├── main.rb           # Menus, toolbar, ações principais
│   │   ├── config.rb         # Configurações persistentes
│   │   ├── core/             # Análise do modelo 3D
│   │   │   ├── model_analyzer.rb
│   │   │   ├── piece_detector.rb
│   │   │   ├── joint_detector.rb
│   │   │   ├── material_mapper.rb
│   │   │   ├── edge_banding.rb
│   │   │   └── hierarchy_builder.rb
│   │   ├── hardware/         # Motor de regras de furação
│   │   │   ├── rules_engine.rb
│   │   │   ├── hinge_rule.rb        # Dobradiça 35mm
│   │   │   ├── system32_rule.rb     # Sistema 32
│   │   │   ├── minifix_rule.rb      # Cam lock
│   │   │   ├── dowel_rule.rb        # Cavilha
│   │   │   ├── handle_rule.rb       # Puxador
│   │   │   ├── drawer_slide_rule.rb # Corrediça
│   │   │   ├── back_panel_rule.rb   # Rebaixo fundo
│   │   │   └── shelf_rule.rb        # Prateleira fixa
│   │   ├── machining/        # Serialização de operações
│   │   │   └── machining_json.rb
│   │   ├── export/           # Exportadores
│   │   │   ├── json_exporter.rb     # JSON → Ornato CNC
│   │   │   ├── csv_exporter.rb      # CSV lista de corte
│   │   │   ├── bom_exporter.rb      # BOM ferragens
│   │   │   └── api_sync.rb          # Sync direto via API
│   │   └── ui/               # Painéis HTML (HtmlDialog)
│   │       ├── main_panel.html
│   │       ├── material_map.html
│   │       ├── hardware_config.html
│   │       ├── drilling_preview.html
│   │       └── export_preview.html
│   ├── tests/fixtures/       # Dados de teste
│   └── icons/                # Ícones toolbar
│
├── optimizer/                # Python optimizer (nesting avançado)
│   └── → link para /cnc_optimizer
│
└── docs/                     # Documentação
    ├── PLANO-SKETCHUP-INTEGRACAO.md
    ├── RESEARCH_SKETCHUP_WOODWORKING_PLUGINS.md
    └── PLANO_CAM_5.0.md

# No ERP (server/ e src/):
server/routes/cnc.js          # Backend API completo (~10K linhas)
server/db.js                  # Schema SQLite
src/pages/ProducaoCNC.jsx     # Frontend principal (~11K linhas)
src/pages/ScanPeca3D.jsx      # Scanner QR + 3D viewer
src/pages/ModoOperador.jsx    # Interface chão de fábrica
src/components/GcodeSimWrapper.jsx  # Simulador G-Code
src/components/EditorEtiquetas.jsx  # Editor de etiquetas
```

## Fluxo Completo

```
DESIGN (SketchUp)
  │ Plugin Ornato detecta peças, gera furações automáticas
  │ Exporta JSON (formato UPMob compatível)
  ▼
ORÇAMENTO (Ornato ERP)
  │ Import JSON → calcula custos material + máquina + mão de obra
  │ Gera proposta para cliente
  ▼
PRODUÇÃO (CNC)
  │ Nesting automático (5+ algoritmos)
  │ G-Code com multi-fase (furos → rasgos → contornos)
  │ Etiquetas QR com rastreabilidade
  ▼
CORTE (Máquina CNC)
  │ Modo Operador (TV/tablet)
  │ Fila de produção em tempo real (WebSocket)
  │ Conferência pós-corte
  ▼
MONTAGEM (Campo)
  │ QR Scan → Vista explodida do módulo
  │ Checklist de montagem
  │ Guia passo a passo
  ▼
ENTREGA
  │ Rastreio GPS
  │ Scan de volumes na entrega
  │ Relatório para cliente
```

## Features Implementadas

### Plugin SketchUp (Ruby)
- Detecção automática de peças (BoundingBox analysis)
- Motor de 8 regras de furação (dobradiça, System32, minifix, cavilha, puxador, corrediça, fundo, prateleira)
- Detecção de junções entre peças
- Mapeamento de materiais SketchUp → Ornato
- Export JSON compatível com Ornato CNC
- Export CSV (lista de corte)
- Export BOM (ferragens)
- Sync direto via API REST
- UI HTML5 com preview de furações

### ERP — Módulo CNC
- Import JSON/DXF/Promob/CSV
- Nesting com 5 algoritmos (MaxRects, Guillotine, BRKGA, Shelf, NFP)
- G-Code multi-fase com helicoidal pocket
- Simulador 2D com animação e cores por operação
- Etiquetas com editor visual drag-and-drop
- QR scan com vista 3D + explodida do módulo
- Conferência pós-corte
- Fila de produção real-time (WebSocket)
- Custeio automático por peça
- Estoque de chapas com alertas
- Predição de desgaste de ferramentas
- Manutenção programada
- Reserva de material
- Backup automático
- Dashboard de desperdício
- Sugestão de agrupamento entre projetos
- Relatório de performance de máquina
- Modo operador TV/tablet
- Rastreio de entrega

### Integrações
- WebSocket real-time
- API pública com webhooks
- Import Promob/Polyboard XML
- Sincronização financeiro
- Notificações push browser
