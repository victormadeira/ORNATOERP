# Ornato CNC para SketchUp

**Plugin completo para marcenaria industrializada** — detecta pecas, gera furacoes automaticas e exporta JSON para producao CNC.

Versao: **0.1.0**

---

## Instalacao

1. Baixe o arquivo `.rbz` (gerado pelo `build.sh` ou disponivel em Releases)
2. Abra o SketchUp
3. Va em **Window > Extension Manager > Install Extension**
4. Selecione o arquivo `ornato_cnc_0.1.0.rbz`
5. Reinicie o SketchUp

O plugin ficara disponivel no menu **Plugins > Ornato CNC** e na toolbar Ornato.

---

## Guia Rapido

### 1. Analisar

Abra seu modelo 3D e clique em **Analisar Modelo** (ou `Ctrl+Shift+A`).
O plugin percorre o modelo, identifica modulos (armarios, balcoes), detecta pecas (laterais, bases, portas, gavetas) e mapeia materiais.

### 2. Processar

Selecione um modulo e clique em **Processar** (ou `Ctrl+Shift+P`).
O motor de regras gera automaticamente todas as furacoes: dobradicas, minifix, cavilhas, corredicas, puxadores, sistema 32 e encaixe do fundo.

### 3. Exportar

Clique em **Exportar JSON** (ou `Ctrl+Shift+E`).
O plugin valida o modelo, mostra um relatorio de erros/avisos, e gera o arquivo JSON compativel com o Ornato CNC Optimizer para nesting e geracao de G-code.

---

## Funcionalidades

- **Deteccao automatica de pecas** — Identifica laterais, bases, topos, portas, gavetas, fundos, prateleiras e divisorias pela geometria e nomenclatura
- **Motor de regras de ferragens** — 8 regras especializadas: dobradicas, minifix, cavilhas, corredicas, puxadores, sistema 32, fundo e prateleiras
- **Catalogo de ferragens** — Especificacoes reais de Blum, Hettich, Hafele, Grass com 29 itens catalogados
- **Validacao completa** — 15 verificacoes de consistencia antes da exportacao (materiais, dimensoes, furos, juncoes)
- **Mapeamento de materiais** — Associa materiais do SketchUp com a biblioteca do Ornato ERP
- **Fita de borda** — Deteccao e configuracao de fitas por face da peca
- **Preview de furacoes** — Visualizacao 2D das operacoes antes de exportar
- **Exportacao JSON** — Formato compativel com o Ornato CNC Optimizer
- **Sincronizacao ERP** — Conexao direta com o Ornato ERP via API REST

---

## Estrutura do Plugin

```
ornato_loader.rb              # Loader / ponto de entrada
ornato_sketchup/
  main.rb                     # Menus, toolbar, atalhos
  config.rb                   # Persistencia de configuracoes
  core/                       # Analise do modelo 3D
    model_analyzer.rb
    piece_detector.rb
    joint_detector.rb
    material_mapper.rb
    edge_banding.rb
    hierarchy_builder.rb
  hardware/                   # Motor de regras de ferragens
    rules_engine.rb
    hinge_rule.rb
    minifix_rule.rb
    dowel_rule.rb
    handle_rule.rb
    drawer_slide_rule.rb
    back_panel_rule.rb
    shelf_rule.rb
    system32_rule.rb
  machining/                  # Geracao de operacoes CNC
    machining_json.rb
  validation/                 # Validacao pre-exportacao
    validator.rb
    validation_dialog.html
  catalog/                    # Catalogo de ferragens
    hardware_catalog.rb
    catalog_dialog.html
  export/                     # Exportacao e sincronizacao
    json_exporter.rb
    csv_exporter.rb
    bom_exporter.rb
    api_sync.rb
  library/                    # Biblioteca de modulos parametricos
    parametric_engine.rb
  ui/                         # Dialogs HTML
    main_panel.html
    hardware_config.html
    material_map.html
    drilling_preview.html
    export_preview.html
  visual/                     # Visualizacao 3D (em desenvolvimento)
  tools/                      # Ferramentas interativas (em desenvolvimento)
icons/                        # Icones da toolbar
```

---

## Compatibilidade

- **SketchUp** 2021 ou superior
- **Sistemas operacionais:** Windows 10/11 e macOS 12+
- **Ruby:** 2.7+ (incluso no SketchUp)

---

## Conexao com Ornato ERP

O plugin pode se conectar ao Ornato ERP para:

- Importar a biblioteca de materiais automaticamente
- Exportar listas de corte e furacoes diretamente para producao
- Sincronizar projetos com o modulo CNC do ERP

Configure a conexao em **Plugins > Ornato CNC > Configurar Ferragens > aba API**.

---

## Build

Para gerar o arquivo `.rbz` para distribuicao:

```bash
cd ornato-plugin
chmod +x build.sh
./build.sh
```

O script gera `ornato_cnc_X.Y.Z.rbz` pronto para instalacao.

---

## Suporte

- **Site:** https://www.gestaoornato.com
- **Email:** suporte@gestaoornato.com
- **Documentacao:** https://docs.gestaoornato.com/sketchup

---

## Licenca

Copyright 2026, Ornato. Todos os direitos reservados.
Software proprietario — uso autorizado apenas com licenca ativa do Ornato ERP.
