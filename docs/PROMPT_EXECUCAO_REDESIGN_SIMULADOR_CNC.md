# Prompt mestre - Execucao do redesign do simulador CNC Ornato

Use este prompt com uma IA/agente de desenvolvimento ou entregue para a equipe como roteiro operacional.

---

Voce e uma IA/agente senior de produto, engenharia frontend, backend CNC/CAM e UX industrial. Sua missao e estudar o plano em `docs/PLANO_REDESIGN_SIMULADOR_CNC.md`, analisar o codigo real do Ornato ERP e executar o redesign completo do cockpit de pre-corte/simulador CNC ate virar um MVP operacional confiavel para marcenaria.

## Contexto do sistema

O Ornato ERP tem um modulo CNC para marcenaria. Ele recebe pecas, faz nesting em chapas, gera G-code e simula a usinagem antes de enviar para maquinas CNC.

Stack:

- Backend: Node.js/Express + SQLite.
- Frontend: React 18 + Vite.
- Simulacao 2D: canvas.
- Simulacao 3D: Three.js.
- G-code gerado no servidor, principalmente em `server/routes/cnc.js`.

Arquivos principais:

- `docs/PLANO_REDESIGN_SIMULADOR_CNC.md`
- `server/routes/cnc.js`
- `src/components/CncSim/parseGcode.js`
- `src/components/CncSim/Sim2D.jsx`
- `src/components/CncSim/Sim3D.jsx`
- `src/components/CncSim/index.jsx`
- `src/pages/ProducaoCNC/tabs/TabPlano/PreCutWorkspace.jsx`
- `src/pages/ProducaoCNC/tabs/TabPlano/PreCutWorkspace.css`
- `src/pages/ProducaoCNC/tabs/TabConfig/CfgMaquinas.jsx`
- `src/pages/ProducaoCNC/shared/operationalMetrics.js`
- `src/pages/ProducaoCNC/shared/tspUtils.js`

## Problema atual

O simulador ainda parece um viewer tecnico de linhas, nao uma interface operacional clara para revisar uma chapa real antes do corte. Existem problemas de UX e de confianca:

- Chapa nem sempre abre enquadrada.
- Playback/timeline nao e sempre claro.
- Usinagens internas podem nao aparecer com clareza.
- Dobradiças/canecos Ø35 podem se confundir com furos comuns.
- Rebaixos, furos, rasgos, canais, contornos e onion-skin precisam ser visualmente distintos.
- A ordem real das operacoes nao esta clara.
- O operador precisa entender a chapa sem ler G-code.
- O cockpit precisa bloquear envio se houver risco critico.

## Benchmarks obrigatorios para estudar

Estude os conceitos e replique o que fizer sentido para o Ornato:

1. Fusion Manufacture Simulation
   - Simulacao, verificacao, stock, colisao, rapidos perigosos.
   - Referencia: https://help.autodesk.com/cloudhelp/ENU/Fusion-CAM/files/GUID76F8D8EF-2725-4203-944B-B9345936DDDB.htm

2. Vectric Aspire/VCarve
   - Preview final, material removal, playback, toolpath preview.
   - Referencia: https://docs.vectric.com/docs/V12.0/Aspire/ENU/Help/form/Preview%20Toolpaths/

3. Mozaik CNC
   - Fluxo design -> nesting -> labels -> G-code, flipside machining, onion skinning, tabs, stay-down.
   - Referencia: https://www.mozaiksoftware.com/mozaik-products/mozaik-cnc

4. Microvellum
   - Route sequencing, grouping rules, double passes, sheet packing, labeling.
   - Referencia: https://www.microvellum.com/solutions/manufacturing/

5. R-Hex
   - Linguagem simples para operador e foco em detectar problemas antes da producao.
   - Referencia: https://www.rhexbrasil.com/

6. G54.APP, CutViewer e NC Viewer
   - Simulacao rapida, upload imediato, editor G-code, playback fluido.
   - Referencias:
     - https://g54.app/
     - https://cutviewer.com/
     - https://ncviewer.com/f360

## Objetivo de produto

Transformar o simulador em uma torre de controle da chapa.

O operador deve conseguir responder rapidamente:

- O que vai ser cortado?
- Onde estao dobradiças, furos, rebaixos, rasgos, canais e contornos?
- Qual e a ordem real das operacoes?
- A ferramenta esta correta?
- A profundidade esta segura?
- O onion-skin/tabs protegem a peca?
- Existe G0 perigoso?
- A chapa esta liberada ou bloqueada?

## Experiencia alvo

Refatore o cockpit para quatro modos principais:

1. Projeto
   - Chapa, pecas, etiquetas, aproveitamento, face A/B, origem XY/Z, margens e status geral.

2. Usinagens
   - Lista clicavel de operacoes reais, agrupadas por bloco de execucao.
   - Tipos minimos:
     - Dobradiça/caneco
     - Furo
     - Rebaixo
     - Rasgo
     - Canal
     - Fresagem
     - Chanfro
     - Contorno
     - Breakthrough onion-skin
     - Tabs
   - Clique em uma operacao deve destacar canvas, timeline e linha do G-code.

3. Simulacao
   - Play/pause/reset.
   - Velocidade de playback.
   - Step por movimento.
   - Step por operacao.
   - Timeline colorida por operacao.
   - Preview final instantaneo.
   - Ferramenta em escala.
   - Linha fina = centro programado.
   - Faixa translucida = largura real da fresa.
   - G0 separado de G1/G2/G3.

4. Verificacao
   - Alertas criticos e medios.
   - Cada alerta precisa apontar operacao, linha, causa e acao recomendada.
   - Bloquear envio para CNC se houver risco critico.

## Regras de design

- A primeira tela deve ser o cockpit funcional, nao uma landing page.
- Nao use layout decorativo ou marketing.
- Interface deve ser densa, clara e operacional.
- Canvas precisa ser o centro da experiencia.
- Play/pause/timeline nunca podem sumir quando houver G-code.
- Chapa sempre deve abrir enquadrada.
- Evite cards dentro de cards.
- Use paineis e faixas funcionais.
- Use icones em botoes de ferramenta.
- Textos devem caber em desktop e notebook.
- Dobradiça, furo e rebaixo nao podem ter a mesma aparencia.
- O operador deve conseguir entender a sequencia olhando a tela por 10 segundos.

## Regras CNC/CAM obrigatorias

- Usinagens internas antes do contorno externo.
- Onion-skin por peca como padrao.
- Breakthrough imediatamente apos o desbaste da peca, exceto se a maquina estiver explicitamente configurada para modo final.
- Dobradiça/caneco Ø35 deve ser categoria propria.
- Feed de plunge separado do feed lateral.
- G0 lateral somente depois de retract seguro.
- Toda operacao gerada deve ter comentario semantico `[OP ...]`.
- G-code, parser, simulador e metrics devem compartilhar a mesma semantica de operacao.

## Forma de trabalhar

Nao entregue apenas analise. Implemente por etapas, valide e deixe o sistema em estado executavel.

Siga este fluxo:

1. Leia o plano completo:
   - `docs/PLANO_REDESIGN_SIMULADOR_CNC.md`

2. Leia o codigo atual:
   - Parser G-code.
   - Sim2D.
   - Sim3D.
   - PreCutWorkspace.
   - Gerador G-code.
   - Configuracao de maquinas.
   - Operational metrics.

3. Mapeie a arquitetura atual:
   - Como o G-code e gerado.
   - Como comentarios `[OP ...]` sao criados.
   - Como o parser transforma linhas em moves.
   - Como moves viram desenho 2D/3D.
   - Como o cockpit recebe dados.

4. Crie um backlog tecnico antes de codar:
   - Divida por Sprint 0, Sprint 1, Sprint 2, Sprint 3.
   - Marque dependencias.
   - Marque risco CNC quando houver.

5. Execute a Sprint 0 primeiro:
   - Fit/enquadramento robusto.
   - Play/pause/timeline 2D e 3D.
   - Lista real de usinagens.
   - Dobradiça Ø35.
   - Onion-skin por peca.
   - Separacao visual de G0/corte/plunge/retract.

6. Valide:
   - `npm run build`
   - lint direcionado nos arquivos alterados, se disponivel.
   - Teste visual em browser local.
   - Screenshot desktop.
   - Se houver fixtures, rode fixtures.

7. So depois avance para Sprint 1:
   - Modos Projeto/Usinagens/Simulacao/Verificacao.
   - Timeline por operacao.
   - Inspector de operacao.
   - Click-to-highlight canvas <-> G-code <-> operacao.
   - Preview final 2D.
   - Alertas clicaveis.

8. Depois Sprint 2:
   - Parser com arcos R.
   - G54-G59/G92/G28/G30.
   - Validador de G0 baixo.
   - Score por operacao.
   - Feed variation metric.
   - Profundidade media/max por ferramenta.
   - Passes repetidos.

9. Depois Sprint 3:
   - Stock removal 2D/3D.
   - Z-map para rebaixo/canal.
   - Dobradiças com geometria visual propria.
   - Tool holder simplificado.
   - Snapshot antes/depois.

## Entregaveis obrigatorios

Ao concluir cada sprint, entregue:

1. Resumo do que mudou.
2. Lista de arquivos alterados.
3. Como testar manualmente.
4. Resultado de build/test/lint.
5. Screenshots ou descricao da validacao visual.
6. Pendencias e riscos restantes.
7. Proximo passo recomendado.

## Modelo de dados desejado para operacoes

Implemente ou aproxime este formato:

```js
{
  id,
  type,
  label,
  pecaId,
  pecaDesc,
  toolCode,
  toolName,
  diameter,
  depth,
  startMove,
  endMove,
  startLine,
  endLine,
  duration,
  distanceCut,
  distanceRapid,
  riskLevel,
  warnings
}
```

## Checks criticos obrigatorios

Implemente progressivamente:

- G0 lateral abaixo de Z seguro.
- Movimento fora dos limites da maquina.
- Profundidade maior que espessura + margem.
- Rebaixo atravessando chapa.
- Dobradiça Ø35 sem ferramenta compativel.
- Furo lateral gerado como furo vertical.
- Contorno externo antes de usinagens internas.
- Onion-skin ausente em peca pequena.
- Onion-skin em modo final quando regra exigir por peca.
- G-code sem feed antes do primeiro G1.
- Arco invalido ou degenerado.
- Work offset/G92/G28 com impacto nao simulado.

## Criterios de aceite do MVP

O MVP so esta pronto quando:

- A chapa abre inteira e centralizada.
- O play aparece e funciona.
- A timeline representa as operacoes reais.
- Dobradiças aparecem como dobradiças.
- Rebaixos, rasgos, furos e contornos sao distinguiveis.
- Breakthrough onion-skin aparece ligado a peca correta.
- Clicar em uma operacao destaca o canvas e o G-code.
- Alertas criticos bloqueiam "Enviar para CNC".
- Build passa.
- O operador consegue entender a ordem da chapa sem ler G-code.

## Cuidados importantes

- Nao reverta mudancas nao relacionadas.
- Nao quebre compatibilidade com NcStudio, Mach3/4, GRBL, LinuxCNC, Syntec e OSAI.
- Qualquer mudanca em G-code precisa ser conservadora.
- Se houver risco de colisao real ou dano de maquina, marque como critico.
- Nao faca refatoracao cosmetica sem melhorar a confianca operacional.
- Sempre preserve o contexto de peca, chapa, ferramenta e operacao.

## Saida esperada da IA/agente

Primeiro, produza um plano de execucao curto, baseado no plano completo.

Depois execute a Sprint 0.

Ao final, responda neste formato:

```md
## Resultado

Resumo objetivo do que foi implementado.

## Arquivos alterados

- caminho/arquivo

## Validacao

- comando executado: resultado
- teste visual: resultado

## Riscos restantes

- item

## Proxima sprint

- item 1
- item 2
- item 3
```

Lembre-se: o objetivo nao e deixar bonito. O objetivo e deixar o operador confiar no corte.

