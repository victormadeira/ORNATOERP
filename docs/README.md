# Documentacao Ornato

Este diretorio e o ponto de entrada para entender o ERP Ornato, o plugin SketchUp e a biblioteca cloud.

Se voce acabou de chegar no projeto, leia nesta ordem:

1. [00_LEIA_PRIMEIRO_SISTEMA_ORNATO.md](00_LEIA_PRIMEIRO_SISTEMA_ORNATO.md)
2. [01_ARQUITETURA_MONOREPO_ORNATO.md](01_ARQUITETURA_MONOREPO_ORNATO.md)
3. [02_ERP_SITE_BACKEND.md](02_ERP_SITE_BACKEND.md)
4. [03_PLUGIN_SKETCHUP.md](03_PLUGIN_SKETCHUP.md)
5. [04_BIBLIOTECA_CLOUD_E_BLOCOS.md](04_BIBLIOTECA_CLOUD_E_BLOCOS.md)
6. [05_AUDITORIA_TECNICA_E_RISCOS.md](05_AUDITORIA_TECNICA_E_RISCOS.md)
7. [06_GUIA_DEV_OPERACIONAL.md](06_GUIA_DEV_OPERACIONAL.md)

## O que cada documento resolve

| Documento | Para que serve |
| --- | --- |
| `00_LEIA_PRIMEIRO_SISTEMA_ORNATO.md` | Explica o sistema em linguagem simples: o que e ERP, o que e plugin, onde fica cada coisa e qual e o fluxo principal. |
| `01_ARQUITETURA_MONOREPO_ORNATO.md` | Mostra a arquitetura geral do repositorio, camadas, tecnologias, scripts e pontos de entrada. |
| `02_ERP_SITE_BACKEND.md` | Documenta o site/ERP: frontend React, backend Express, autenticacao, rotas, banco SQLite e APIs principais. |
| `03_PLUGIN_SKETCHUP.md` | Documenta o plugin SketchUp: Ruby, UI v2, callbacks, miras, biblioteca, usinagens, validacao e updater. |
| `04_BIBLIOTECA_CLOUD_E_BLOCOS.md` | Explica biblioteca cloud, blocos `.skp`, JSON parametrico, variacoes, padroes da marcenaria e painel ripado cavilhado. |
| `05_AUDITORIA_TECNICA_E_RISCOS.md` | Resume a auditoria tecnica: o que esta forte, riscos, dividas tecnicas e recomendacao para beta. |
| `06_GUIA_DEV_OPERACIONAL.md` | Guia pratico para devs: como rodar, onde mexer, como testar, como adicionar rota, pagina, bloco e release. |

## Pastas importantes

| Caminho | Conteudo |
| --- | --- |
| `/Users/madeira/SISTEMA NOVO/src` | Frontend React do ERP. |
| `/Users/madeira/SISTEMA NOVO/server` | Backend Express, rotas API, banco SQLite e WebSocket. |
| `/Users/madeira/SISTEMA NOVO/ornato-plugin` | Plugin SketchUp completo, incluindo Ruby, UI, biblioteca, testes e docs especificas. |
| `/Users/madeira/SISTEMA NOVO/ornato-plugin/biblioteca` | Biblioteca atual de modulos, agregados, componentes, materiais e arquivos `.skp`. |
| `/Users/madeira/SISTEMA NOVO/data` | Dados auxiliares usados pelo sistema e pela migracao. |

## Regra de ouro

Antes de implementar qualquer melhoria grande, confira:

1. Qual camada sera alterada: ERP, plugin, biblioteca ou banco.
2. Qual documento acima explica aquela camada.
3. Quais testes ou verificacoes manuais protegem a mudanca.
4. Se a mudanca afeta compatibilidade com blocos, biblioteca cloud, usinagens ou perfis de marcenaria.

O objetivo desta documentacao e reduzir conversa repetida, evitar alteracao no lugar errado e acelerar a entrada de qualquer pessoa nova no projeto.
