# Plano completo - Redesign do simulador e cockpit CNC

## 1. Objetivo

Transformar o pre-corte CNC do Ornato em um cockpit operacional confiavel para marcenaria: o operador precisa entender a chapa, as usinagens, a ordem real, os riscos e o resultado esperado antes de enviar para a CNC.

O alvo nao e apenas "simular G-code". O alvo e responder, em poucos segundos:

- O que vai ser usinado?
- Onde estao furos, dobradicas, rebaixos, rasgos, canais, contornos e passes finais?
- A ordem esta segura?
- A ferramenta esta correta?
- O onion-skin/tabs/stay-down protegem a peca?
- O G-code gerado bate com o plano?
- Existe risco de colisao, G0 baixo, profundidade excessiva, peca soltar ou perda de referencia?

## 2. Benchmarks e referencias

### Fusion Manufacture

Referencia: https://help.autodesk.com/cloudhelp/ENU/Fusion-CAM/files/GUID76F8D8EF-2725-4203-944B-B9345936DDDB.htm

Pontos fortes a copiar:

- Separacao clara entre animacao e verificacao.
- Visualizacao de ferramenta, estoque e remocao de material.
- Verificacao em background: colisao, overtravel e rapido perigoso.
- Simulacao com ou sem modelo de maquina.

Aplicacao no Ornato:

- Criar modo "Simulacao" para playback.
- Criar modo "Verificacao" para checks independentes do playback.
- Mostrar alertas diretamente na operacao e na linha do G-code.

### Vectric Aspire/VCarve

Referencias:

- https://docs.vectric.com/docs/V12.0/Aspire/ENU/Help/form/Preview%20Toolpaths/
- https://docs.vectric.com/docs/V12.5/VCarvePro/ENU/Help/page/user-guide/

Pontos fortes a copiar:

- Preview do resultado final da usinagem.
- Material visual configuravel.
- Controles de playback de video.
- Preview por toolpath ou todos os toolpaths.
- Reset do material para simular de novo.

Aplicacao no Ornato:

- Snapshot final instantaneo da chapa.
- Timeline por operacao.
- Botao "Preview final" separado do "Play".
- Visual de material MDF/MDP/compensado.

### Mozaik CNC

Referencia: https://www.mozaiksoftware.com/mozaik-products/mozaik-cnc

Pontos fortes a copiar:

- Fluxo completo design -> nesting -> G-code.
- True-shape nesting, labels, post-processors e flipside machining.
- Onion skinning, tabs e stay-down para pecas pequenas.
- Simulacao e edicao de G-code antes da producao.
- Programas por chapa ou por job inteiro.

Aplicacao no Ornato:

- Modo operador de uma chapa.
- Face A/B com fluxo de virar chapa.
- Etiquetas vinculadas a peca/usinagem.
- Configuracoes claras para onion, tabs e stay-down.

### Microvellum

Referencia: https://www.microvellum.com/solutions/manufacturing/

Pontos fortes a copiar:

- Route sequencing avancado.
- Grouping rules.
- Sheet part packing.
- Double passes.
- On-demand labeling.
- Geracao automatica de geometria, ferramentas, feeds e codigo.

Aplicacao no Ornato:

- Regras de sequenciamento por classe de operacao.
- Agrupamento por ferramenta e risco.
- Painel de eficiencia: rapido, corte, trocas, stay-down, retracoes.

### R-Hex

Referencia: https://www.rhexbrasil.com/

Pontos fortes a copiar:

- Promessa de codigo rapido e inteligente.
- Foco em detectar problemas antes que ocorram.
- Linguagem voltada ao operador de marcenaria.

Aplicacao no Ornato:

- Alertas em linguagem operacional, nao tecnica demais.
- "Liberado para cortar" so quando checks criticos passam.
- Score de confianca por chapa.

### G54.APP / CutViewer / NC Viewer

Referencias:

- https://g54.app/
- https://cutviewer.com/
- https://ncviewer.com/f360

Pontos fortes a copiar:

- Upload e simulacao imediata.
- Visualizacao G-code rapida.
- Playback fluido.
- Editor G-code integrado.
- Work offset/origin picker.

Aplicacao no Ornato:

- Simulador precisa abrir rapido mesmo com arquivo grande.
- G-code deve ser sincronizado com canvas e operacao.
- Origem G54/Z-origin precisa ser explicita visualmente.

### Cabinet Vision

Referencia: https://hexagon.com/products/cabinet-vision-xoptimizer

Pontos fortes a copiar:

- Visualizacao de painel para operador.
- Labels sob demanda.
- Fluxo de fabricacao baseado em nesting.

Aplicacao no Ornato:

- Chapa como entidade principal.
- Labels e impressao devem estar dentro do fluxo de liberacao.

## 3. Nova experiencia proposta

### 3.1 Estrutura da tela

Quatro modos principais:

1. Projeto
2. Usinagens
3. Simulacao
4. Verificacao

Layout recomendado:

- Topbar fixa: projeto, chapa, maquina, status, acoes principais.
- Lateral esquerda: checklist de liberacao e score operacional.
- Centro: viewport 2D/3D da chapa.
- Lateral direita: inspetor contextual.
- Rodape: timeline/playback sempre visivel quando houver G-code.

Regra de UX:

- O canvas nunca pode ficar fora do enquadramento.
- Play/pause/timeline nunca podem sumir.
- Toda operacao clicada precisa destacar canvas, G-code e painel.
- O operador nao deve precisar ler G-code para confiar no arquivo.

### 3.2 Modo Projeto

Funcionalidades:

- Chapa enquadrada automaticamente.
- Peca com nome, dimensoes, sentido veio e etiqueta.
- Aproveitamento da chapa.
- Retalhos e sobras.
- Face A/B.
- Origem XY e Z-origin visual.
- Area de seguranca, margem de mesa, refilo.
- Status de etiquetas.

Aceite:

- Ao abrir, a chapa aparece inteira e centralizada.
- Labels nao sobrepoem a ponto de destruir a leitura.
- O usuario entende qual lado/face esta ativo.

### 3.3 Modo Usinagens

Funcionalidades:

- Lista real de operacoes extraida do parser:
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
- Agrupamento por operacao consecutiva, nao apenas por tipo.
- Cada item mostra:
  - peca
  - ferramenta
  - diametro
  - profundidade
  - tempo
  - linha inicial/final
  - risco
- Clique em operacao:
  - destaca caminho no canvas
  - move timeline
  - rola G-code
  - mostra detalhes no inspetor

Aceite:

- Dobradiças Ø35 nunca aparecem como furo generico.
- Breakthrough onion-skin aparece como operacao propria.
- Furos/rebaixos/rasgos aparecem antes dos contornos externos.

### 3.4 Modo Simulacao

Funcionalidades:

- Play/pause/reset.
- Velocidades: 0.25x, 0.5x, 1x, 2x, 5x, 10x.
- Step por movimento.
- Step por operacao.
- Timeline colorida por tipo de operacao.
- Preview final instantaneo.
- Ferramenta desenhada em escala.
- Linha fina: centro programado.
- Largura translucida: area removida pela fresa.
- G0 separado de G1/G2/G3.
- Atualizacao sincronizada com G-code.

Aceite:

- Play funciona em 2D e 3D.
- Ao arrastar timeline, canvas, operacao e linha de G-code sincronizam.
- O operador distingue rapido, corte, plunge, retract e arco.

### 3.5 Modo Verificacao

Checks criticos:

- G0 lateral abaixo de Z seguro.
- G1 sem feed antes do primeiro corte.
- Profundidade maior que espessura + margem permitida.
- Furo Ø35 sem broca/fresa compativel.
- Dobradiça fora da profundidade esperada.
- Rebaixo ultrapassando espessura.
- Contorno antes de usinagens internas.
- Onion-skin ausente em peca pequena.
- Onion-skin diferido quando regra da maquina exige por peca.
- Peca pequena sem tab/onion/vacuo suficiente.
- Movimento fora dos limites da maquina.
- G28/G30/G92/work offset com impacto na simulacao.
- Arco degenerado ou R/IJ invalido.
- Troca de ferramenta inexistente no magazine.

Checks medios:

- Retracao excessiva aumentando ciclo.
- Muitos G0 pequenos.
- Feed muito variavel.
- Trocas de ferramenta fora de ordem.
- Distancia de rapido alta.
- Redundancia de blocos.

Aceite:

- O botao "Enviar para CNC" fica bloqueado em erro critico.
- Cada alerta aponta operacao, linha e causa.
- O operador consegue clicar no alerta e ver o trecho.

## 4. Arquitetura tecnica

### 4.1 Parser G-code

Criar parser como motor unico para 2D, 3D, metrics e verificacao.

Responsabilidades:

- Modal state: G0/G1/G2/G3, G17, G20/G21, G90/G91, F, S, T, M.
- Coordenadas X/Y/Z.
- Arcos I/J e R.
- Offsets G54-G59.
- G92.
- G28/G30.
- Eventos: toolchange, spindle, operation, comment metadata.
- Operacoes enriquecidas via comentarios `[OP ...]`.

Entregavel:

- `parseGcode.js` devolvendo:
  - moves
  - operations
  - tools
  - warnings
  - rawLines
  - lineToMoveIdx
  - operationToMoveRange

### 4.2 Modelo de operacao

Criar entidade derivada:

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

### 4.3 Renderer 2D

Camadas:

1. Mesa/origem/margens
2. Chapa
3. Pecas
4. Usinagens internas
5. Contornos
6. Rapidos
7. Operacao selecionada
8. Ferramenta atual
9. Labels
10. Alertas

Requisitos:

- Pan/zoom previsivel.
- Fit robusto.
- Auto-orient controlado, nunca escondendo a chapa.
- Hit-test de peca e operacao.
- Render incremental para arquivos grandes.

### 4.4 Renderer 3D

Fase 1:

- Chapa extrudada.
- Toolpath em 3D.
- Ferramenta em escala.
- Textura de remocao projetada.

Fase 2:

- Heightmap/Z-map real.
- Preview final de rebaixos/canais/furos.
- Material MDF visual.

Fase 3:

- Holder simplificado.
- Colisao ferramenta/holder/stock/fixtures.

### 4.5 G-code generator

Regras obrigatorias:

- Usinagens internas antes de contorno externo.
- Onion-skin por peca como default.
- Breakthrough imediatamente apos desbaste da peca.
- Comments `[OP ...]` ricos para toda operacao.
- Feed de plunge separado do feed lateral.
- G0 lateral sempre apos retract seguro.
- Supressao de blocos redundantes.
- Diferencas reais por post-processor.

## 5. Roadmap de execucao

### Sprint 0 - estabilizacao critica (1-2 dias)

Objetivo: parar de mentir para o operador.

Tarefas:

- Corrigir classificacao de dobradiças Ø35.
- Corrigir onion-skin para por peca.
- Garantir play/pause/timeline em 2D.
- Corrigir fit/enquadramento.
- Separar G0, corte, plunge e retract visualmente.
- Fazer lista real de usinagens por bloco.

Aceite:

- A chapa abre enquadrada.
- Dobradiças aparecem.
- O botao play aparece e funciona.
- Onion breakthrough aparece logo apos a peca correspondente.

### Sprint 1 - MVP operacional (1 semana)

Objetivo: simular e revisar uma chapa com confianca.

Tarefas:

- Criar tabs Projeto/Usinagens/Simulacao/Verificacao.
- Criar timeline por operacao.
- Criar inspetor de operacao.
- Criar click-to-highlight canvas <-> G-code <-> operacao.
- Criar alerta visual de G0 perigoso.
- Criar preview final 2D instantaneo.
- Criar legenda profissional por tipo.

Aceite:

- Operador revisa uma chapa sem abrir G-code manualmente.
- Cada alerta navega para linha/op.
- Simulacao 2D e G-code ficam sincronizados.

### Sprint 2 - CAM quality layer (1-2 semanas)

Objetivo: melhorar qualidade e seguranca do G-code.

Tarefas:

- Parser com arcos R.
- Parser com G54-G59/G92/G28/G30.
- Detector de arcos degenerados.
- Validador de plunge/retract.
- Score por operacao.
- Feed variation metric.
- Profundidade media/max por ferramenta.
- Passes repetidos no mesmo ponto.
- Estimativa de tempo por maquina.

Aceite:

- Relatorio de risco por chapa.
- Score operacional explica causa.
- G-code com risco critico bloqueia envio.

### Sprint 3 - Simulador visual premium (2-3 semanas)

Objetivo: ficar visualmente proximo de VCarve/CutViewer para 2.5D.

Tarefas:

- Stock removal 2D por ferramenta.
- Preview final em alta clareza.
- Sim3D com textura/material decente.
- Z-map inicial para rebaixos e canais.
- Dobradiças com geometria visual propria.
- Tool holder simplificado.
- Snapshots antes/depois.

Aceite:

- Usuario entende o resultado final sem rodar playback.
- Rebaixos e furos ficam visualmente diferentes de linhas.
- 3D deixa de ser decorativo e passa a validar profundidade.

### Sprint 4 - Produção e diferenciais comerciais (1-3 meses)

Objetivo: competir com R-Hex/Mozaik em fluxo de marcenaria.

Tarefas:

- Face B/flipside machining robusto.
- Etiquetas sob demanda vinculadas ao nesting.
- Recorte/reprocessamento de pecas danificadas.
- Biblioteca de ferragens por modulo.
- Dobradiças, minifix, cavilhas, corrediças automáticas.
- Relatorio de aproveitamento e tempo por chapa.
- Otimizacao stay-down e sequenciamento por fixture.
- Export/import DXF melhorado.
- Presets reais por controlador.

Aceite:

- Ornato resolve a operacao de uma marcenaria pequena/media sem CAM externo no fluxo comum.

## 6. Backlog priorizado por impacto

1. Play/timeline 2D/3D confiavel.
2. Lista real de usinagens clicavel.
3. Dobradiça/caneco como classe propria.
4. Onion-skin por peca.
5. Fit/enquadramento robusto.
6. Preview final instantaneo.
7. Validador de G0 baixo.
8. Operacao atual sincronizada com G-code.
9. Score por operacao.
10. Face A/B e flip claro.
11. Stock removal 3D/Z-map.
12. Tool holder e colisao.
13. Biblioteca de ferragens.
14. Recorte/reprocessamento de peca.
15. Relatorios comerciais de economia/tempo.

## 7. Criterios de aceite gerais

- Nenhum envio para CNC com alerta critico aberto.
- Toda operacao tem tipo, ferramenta, profundidade, tempo e linha.
- Toda linha de G-code de movimento aponta para uma operacao ou evento.
- G-code, canvas e timeline ficam sincronizados.
- A chapa sempre abre enquadrada.
- O operador consegue explicar a sequencia olhando a tela por 10 segundos.
- Dobradiças, furos e rebaixos nao podem se misturar visualmente.
- Onion-skin precisa mostrar desbaste e breakthrough como etapas ligadas.

## 8. Riscos tecnicos

- Parser incompleto causa simulacao falsa.
- Comentarios `[OP ...]` pobres impedem UX boa.
- Simulacao 3D real pode pesar com muitos movimentos.
- G-code gerado sem operacao semantica vira apenas linha.
- Legado de configuracao de maquina pode manter padroes perigosos.
- Testes manuais com poucos jobs nao cobrem casos reais de oficina.

Mitigacoes:

- Criar corpus de G-codes reais.
- Salvar snapshots de parser esperados.
- Validar cada sprint com 5 chapas reais: cozinha, dormitorio, portas, gavetas e job misto.
- Separar preview rapido 2D de simulacao 3D pesada.
- Criar testes para operacoes criticas: dobradica, rebaixo, rasgo, contorno, onion.

## 9. Suite de testes recomendada

Arquivos de teste:

- `fixture_dobradica_35mm.nc`
- `fixture_onion_por_peca.nc`
- `fixture_onion_diferido_final.nc`
- `fixture_rebaixo_canal.nc`
- `fixture_g0_baixo.nc`
- `fixture_arco_R.nc`
- `fixture_g92_g54.nc`
- `fixture_face_b.nc`

Testes automatizados:

- Parser identifica tipos de operacao.
- Parser calcula move ranges.
- Onion por peca gera breakthrough imediatamente apos contorno.
- Dobradiça Ø35 vira categoria `dobradica`.
- G0 baixo vira alerta critico.
- Preview tem movimentos visiveis.
- Fit calcula escala valida.

Testes visuais:

- Screenshot desktop 1920x1080.
- Screenshot notebook 1366x768.
- Screenshot mobile/tablet se cockpit for responsivo.
- Canvas nao pode ficar vazio.
- Timeline e play sempre visiveis.

## 10. Decisao de produto

O Ornato nao deve tentar ser um Fusion completo. O diferencial deve ser:

- fluxo integrado ao ERP;
- contexto de projeto, peca, etiqueta e chapa;
- seguranca operacional para marcenaria;
- G-code confiavel sem CAM externo;
- linguagem simples para operador.

O norte do redesign:

> Menos "viewer de G-code", mais "torre de controle da chapa".

