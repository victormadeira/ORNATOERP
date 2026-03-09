# Glossario Tecnico — CNC Optimizer Ornato

## Termos de Producao

| Termo | Definicao |
|-------|-----------|
| **Chapa** | Placa de MDF/MDP retangular padrao (2750x1850mm) |
| **Retalho** | Sobra de chapa reutilizavel (>= 600x300mm) |
| **Refilo** | Margem removida das 4 bordas da chapa antes do nesting (padrao 10mm) |
| **Kerf** | Largura do corte do disco/fresa (padrao 4mm) |
| **Veio** | Direcao da fibra/textura do material. Restringe rotacao |
| **DOC** | Depth Of Cut — profundidade por passe da fresa |
| **Fita de borda** | Fita PVC/ABS colada na borda da peca |
| **Acabamento** | Codigo da superficie do material (ex: BRANCO_TX, CARVALHO_HANOVER) |
| **Esquadrejadeira** | Serra de bancada para corte guilhotina de chapas |
| **Engrossado** | Painel duplo colado (2x 15mm = 31mm real) |

## Termos de CNC

| Termo | Definicao |
|-------|-----------|
| **Tabs** | Pontes de material que mantem a peca presa durante corte do contorno |
| **Onion skin** | Camada fina (~0.5mm) deixada no ultimo passe, cortada depois com passe de breakthrough |
| **Lead-in** | Arco de entrada que evita marca na peca ao iniciar contorno |
| **Lead-out** | Arco de saida ao finalizar contorno |
| **Rampa** | Entrada angular da fresa (vs mergulho vertical) |
| **Climb** | Direcao de corte concordante (fresa gira no sentido do avanco) |
| **Convencional** | Direcao de corte discordante (fresa gira contra o avanco) |
| **Z-seguro** | Altura Z para deslocamento rapido sem risco de colisao |
| **Z-aproximacao** | Altura Z para aproximacao lenta antes de mergulhar |
| **Postprocessador** | Modulo que converte toolpath em G-code especifico da maquina |
| **Magazine** | Conjunto de ferramentas disponiveis na maquina CNC |
| **Caneco** | Furo Ø35mm para dobradica de caneco |
| **Minifix** | Conector de moveis com tambor Ø15mm + parafuso Ø8mm |
| **Cavilha** | Pino de madeira Ø8mm para alinhamento/uniao |
| **Sistema 32** | Furacoes em grid de 32mm para prateleiras |
| **Rasgo** | Canal de serra para encaixe de fundo (ex: rasgo de fundo) |

## Termos de Otimizacao

| Termo | Definicao |
|-------|-----------|
| **Nesting** | Processo de encaixar pecas 2D dentro de chapas minimizando desperdicio |
| **NFP** | No-Fit Polygon — poligono que define todas as posicoes onde uma peca NAO pode ser colocada em relacao a outra |
| **IFP** | Inner-Fit Polygon — regiao valida dentro da chapa onde o centro da peca pode estar |
| **MaxRects** | Algoritmo de nesting baseado em retangulos livres maximais |
| **Guillotine** | Restricao de corte onde cada corte divide a chapa em 2 partes (como esquadrejadeira) |
| **Skyline** | Algoritmo de nesting que mantem perfil da "linha do horizonte" |
| **Shelf** | Algoritmo que organiza pecas em prateleiras horizontais |
| **BRKGA** | Biased Random-Key Genetic Algorithm — variante de GA com chaves aleatorias |
| **R&R** | Ruin and Recreate — metaheuristica que destroi parcialmente e reconstroi solucao |
| **LAHC** | Late Acceptance Hill Climbing — heuristica de busca local |
| **SA** | Simulated Annealing — recozimento simulado |
| **TSP** | Travelling Salesman Problem — problema do caixeiro viajante |
| **Bin packing** | Problema de empacotar objetos em recipientes |
| **Aproveitamento** | Percentual da area da chapa efetivamente ocupado por pecas |
| **Compactacao** | Processo de mover pecas para eliminar gaps desnecessarios |
| **Cromossomo** | Representacao de uma solucao no algoritmo genetico |
| **Fitness** | Score que mede qualidade de uma solucao no GA |

## Termos de Vacuo

| Termo | Definicao |
|-------|-----------|
| **Mesa de vacuo** | Mesa da CNC com sistema de succao para segurar material |
| **Zona de vacuo** | Regiao da mesa com succao ativa |
| **Vacuum Risk Index** | Indice 0-1 que mede risco de soltura da peca (0=seguro, 1=critico) |
| **Detachment risk** | Risco de a peca se soltar durante o corte |
| **Soltura progressiva** | Perda gradual de succao conforme pecas vizinhas sao cortadas |
| **Area apoiada** | Area da peca que esta sobre zona de vacuo ativa |

## Termos de Integracao

| Termo | Definicao |
|-------|-----------|
| **upmdraw** | Codigo de orientacao da peca no UpMobb (ex: FTE1x2, FTED1x3) |
| **upmcode** | Codigo de tipo da peca no UpMobb (ex: CM_LAT_DIR, CM_BAS) |
| **persistent_id** | ID unico da peca que persiste entre exportacoes |
| **machining_json** | JSON com workers (operacoes) e contorno da peca |
| **model_entities** | Secao do JSON com hierarquia modulo → peca → sub-entidades |
| **Face A** | Face superior da peca na mesa CNC (primeira usinagem) |
| **Face B** | Face inferior (requer flip da chapa para usinar) |
| **Worker** | Operacao individual de usinagem (furo, rasgo, pocket, contorno) |
