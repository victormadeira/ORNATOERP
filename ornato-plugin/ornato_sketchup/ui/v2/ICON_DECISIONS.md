# Decisoes visuais dos icones Ornato SketchUp

Documento de referencia para os SVGs em `icons.js`. A interface atual do plugin usa 9 tabs ativas na trilha Projeto -> Producao, mais o brand mark Ornato. A decisao atual e padronizar os tab icons em Tabler Icons v3.44.0 outline, mantendo SVG inline com `currentColor`, sem PNG e sem dependencia em runtime.

**Logo Ornato.** O mark usa um "O" geometrico com tres linhas internas horizontais, criando uma leitura rapida de prateleiras, chapas empilhadas e ranhuras tecnicas. A forma fica premium e monocromatica, sem recorrer a ferramentas tradicionais de marcenaria.

**Projeto (`detalhes`).** Usa `clipboard-data` da Tabler para comunicar ficha tecnica com dados estruturados do projeto. A leitura fica mais objetiva que um documento generico e casa bem com cliente, ambiente, medidas e observacoes.

**Ambiente (`ambiente`).** Usa `dimensions` da Tabler para comunicar espaco fisico e medidas, com retangulo e setas de dimensao. A leitura favorece obra, escala e planta sem cair em icone de casa generico.

**Biblioteca (`biblioteca`).** Usa `box-multiple`, que aproxima a tab de catalogo de modulos prontos e evita a leitura literal de livros. A sobreposicao sugere estoque/galeria de componentes reutilizaveis.

**Internos (`internos`).** Usa `layout-board-split`, uma caixa com subdivisoes internas. A silhueta conversa com prateleiras, gavetas e divisorias dentro do modulo, separando de Biblioteca.

**Acabamentos (`acabamentos`).** Usa `color-swatch` da Tabler, um dos melhores equivalentes de biblioteca para materiais e amostras. Funciona para MDF, laminados, vidros, metais e fitas sem virar pincel generico.

**Ferragens (`ferragens`).** Usa `assembly`, que comunica componente mecanico, conexao e montagem sem usar chave inglesa. A forma hexagonal tambem ajuda a diferenciar de configuracoes globais.

**Usinagens (`usinagens`).** Usa `hammer-drill` da Tabler, que neste contexto le visualmente como cabecote vertical/ferramenta de usinagem. Nao e tao especifico quanto um spindle custom, mas entrega consistencia de biblioteca e boa leitura em 16px.

**Validacao (`validacao`).** Usa `shield-check` da Tabler. O escudo comunica controle de qualidade e o check externo deixa claro que esta tab e a etapa de aprovacao tecnica antes do envio.

**Producao (`producao`).** Usa `building-factory-2`, que comunica macro de fabrica e status produtivo com uma silhueta industrial reconhecivel. Fica bem separado de Usinagens, que agora e ferramenta/cabecote.
