# Ornato CNC — Plugin para SketchUp

## Visao Geral

O Ornato CNC e um plugin para SketchUp (2021+) que transforma modelos 3D de marcenaria em dados prontos para producao CNC. Ele detecta automaticamente pecas, juncoes entre pecas, e gera toda a furacao e usinagem necessaria — sem que o modelador precise desenhar furos manualmente.

## O que o plugin faz

1. **Detecta pecas** — varre o modelo e identifica chapas (grupos retangulares com espessura definida)
2. **Detecta juncoes** — analisa quais pecas estao em contato e classifica o tipo de juncao
3. **Aplica regras de ferragem** — baseado na juncao e no papel de cada peca, gera operacoes de usinagem
4. **Valida o modelo** — verifica inconsistencias antes de exportar
5. **Exporta JSON** — gera arquivo com todas as pecas, dimensoes, bordas e usinagens para o ERP/CNC

## Fluxo de trabalho

```
MODELAGEM          ANALISE            FURACAO           EXPORTACAO

Usuario modela  →  Plugin detecta  →  Plugin aplica  →  JSON para
o movel no         pecas e            regras de          Ornato ERP
SketchUp           juncoes            ferragem           e CNC
```

### Passo a passo

1. O usuario modela o movel usando grupos/componentes nomeados conforme a convencao Ornato
2. Clica em **Analisar Modelo** (Ctrl+Shift+A) — o plugin detecta todas as pecas e juncoes
3. Clica em **Processar** (Ctrl+Shift+P) — o plugin aplica as regras e gera usinagens
4. Revisa no painel de **Validacao** — corrige alertas se houver
5. Clica em **Exportar** (Ctrl+Shift+E) — gera o JSON final

## Principio fundamental

> **O modelador nao desenha furos. Ele modela pecas solidas e o plugin calcula toda a furacao automaticamente por deteccao de colisao.**

O papel do modelador e:
- Modelar as pecas com dimensoes corretas
- Nomear cada grupo/componente conforme a convencao
- Organizar a hierarquia (modulo > pecas)
- Atribuir materiais e bordas

O plugin cuida do resto.

## Requisitos

- SketchUp 2021 ou superior
- Windows 10+ ou macOS 10.15+
- Conta ativa no Ornato ERP (para sync e biblioteca remota)

## Documentacao

| Documento | Conteudo |
|-----------|----------|
| 02_HIERARQUIA_MODELO | Como organizar grupos e componentes |
| 03_NOMENCLATURA | Tabela completa de codigos de modulos e pecas |
| 04_SISTEMA_COLISAO | Como funciona a deteccao automatica de juncoes |
| 05_MATRIZ_USINAGENS | Qual usinagem e aplicada para cada par de pecas |
| 06_CATALOGO_FERRAMENTAS | Todas as ferramentas, diametros e profundidades |
| 07_CONFIGURACAO_REGRAS | Como configurar e personalizar as regras |
| 08_MATERIAIS_BORDAS | Nomenclatura de materiais, acabamentos e bordas |
| 09_EXPORTACAO_JSON | Formato de saida e campos do JSON |
| 10_EXEMPLOS_PRATICOS | Casos reais passo a passo |
