# Orçamento rápido no ORNATOERP

## Uso

A nova entrada **Comercial → Orçamento rápido** e o botão em **Orçamentos** abrem `/orcamento-rapido`. A tela usa a permissão existente de orçamentos. Nenhuma migração de banco é necessária.

1. Selecione um cliente cadastrado e informe o projeto.
2. Escolha os materiais do corpo, fundo e frentes e os padrões de dobradiças, corrediças, **puxadores** e articuladores. O padrão de puxador também aceita **Sem puxador**.
3. Na biblioteca, abra **Caixas**, procure uma receita do catálogo e informe largura, altura e profundidade, em milímetros. A aba **Modelos prontos** continua disponível como atalho para balcões, gaveteiros, aéreos e nichos.
4. Selecione o móvel e use **Componentes** para acrescentar portas, gavetas, prateleiras, divisórias ou qualquer outro componente cadastrado. As inclusões são por unidade do móvel; a quantidade da linha multiplica toda a composição.
5. Em **Editar composição**, ajuste quantidades, variáveis, medidas próprias, materiais e ferragens de cada componente. É possível duplicar e remover componentes, trocar o puxador individualmente, desligar subitens e habilitar ou desabilitar peças da caixa.
6. Use **Ferragens e puxadores** para acrescentar acessórios avulsos. Informe a quantidade na unidade do cadastro, inclusive metragem fracionária para perfis e outros insumos vendidos por metro. Inclua laterais, rodapés e fechamentos como peças complementares quando necessários.
7. Confira insumos, custo de fabricação, taxas e preço de venda. Salve ou abra o editor completo.

A tela autenticada começa vazia. O botão de exemplo adiciona uma cozinha com 3.000 mm de inferiores e 3.000 mm de aéreos: pia de 1.200 mm, gaveteiro de 600 mm, balcão de 1.200 mm, dois aéreos de 1.200 mm e um aéreo de 600 mm. São cinco linhas e seis móveis. Os complementos devem ser acrescentados conforme o projeto.

## Catálogo e preços

A composição livre usa **todas as caixas e todos os componentes disponíveis nos cadastros**, sem depender de um nome específico. A biblioteca permite busca e filtro por categoria. Ferragens e acessórios vêm da mesma biblioteca de insumos do ERP.

Somente os atalhos da aba **Modelos prontos** dependem dos cadastros abaixo, resolvidos por nome normalizado e identificação no catálogo:

| Receita | Cadastro necessário |
| --- | --- |
| Inferiores e gaveteiro | Caixa Baixa / Balcão |
| Aéreos e nicho | Caixa Aérea |
| Portas | Porta |
| Gavetas | Gaveta |
| Prateleiras | Prateleira |

Um cadastro ausente ou com nome duplicado deixa o respectivo atalho indisponível e indica a pendência; a composição livre continua disponível. Se desejar adaptar os atalhos a outros nomes de cadastro, ajuste o mapeamento em `src/quickQuote.js` para as receitas equivalentes; não crie preços ou receitas fictícios no cadastro de produção.

`src/quickQuoteAdapter.js` lê `/clientes`, `/catalogo?tipo=caixa`, `/catalogo?tipo=componente`, `/biblioteca` e `/config/taxas` pelo cliente autenticado existente. O salvamento usa `POST /orcamentos` para criar um rascunho e `PUT /orcamentos/:id` para atualizá-lo. O custo e o preço são recalculados a partir dos itens antes de montar o payload. O editor completo recebe o registro retornado pela API.

No orçamento rápido, `strictCatalog: true` impede concluir o preço com insumos que só existam na biblioteca embutida do código. Materiais, ferragens, fórmulas e valores inválidos apresentam pendências. Os padrões herdados do editor completo permanecem disponíveis para os orçamentos antigos, com os avisos correspondentes.

## Materiais, puxadores e composição individual

Cada caixa pode seguir os materiais gerais ou usar materiais próprios para corpo, fundo e frentes. O editor permite retornar aos padrões gerais. A frente de um componente também pode ter material próprio, preservado nas próximas alterações do padrão.

A resolução de ferragens respeita a escolha individual, depois o padrão geral e, por último, a receita do componente. Desligar um subitem impede seu consumo. Um puxador escolhido individualmente continua ativo mesmo quando o padrão geral é **Sem puxador**; retirar a escolha individual faz o componente herdar esse padrão novamente. A proposta usa essa mesma resolução para descrever os modelos escolhidos.

As trocas dentro de um componente exigem unidades compatíveis. Um puxador unitário segue a quantidade de portas ou gavetas definida na receita. Um perfil vendido por metro deve entrar como ferragem avulsa com metragem explícita; o sistema não transforma automaticamente uma porta em um metro de perfil. Quantidades em metros preservam frações; unidades e pares avulsos exigem quantidades inteiras.

`src/quoteComposition.js` altera instâncias mantendo os snapshots de caixa, peças e componentes. Ao personalizar um modelo pronto, ele passa para composição livre e deixa de ser reconstruído pelo atalho. Desabilitar uma peça é reversível, com preservação da receita original. Uma composição sem consumo ativo apresenta pendência antes do salvamento.

## Cálculo compartilhado e compatibilidade

`src/quoteCalculator.js` reúne a normalização da biblioteca, resolução de materiais, agregação de custos e aplicação do desconto. Tanto a tela rápida quanto `Novo.jsx` chamam esse módulo. As categorias, coeficientes, markups, custos proporcionais ou por hora, consumíveis e divisor comercial existentes no ERP continuam sendo utilizados.

As contagens de peças, metros de fita, bordas, portas e junções respeitam as multiplicidades da composição. Perda de chapa igual a zero é preservada. “Lucro configurado” é um parâmetro da fórmula do ERP, não a margem efetivamente apurada do negócio.

O orçamento salva snapshots de caixa e componentes. O editor completo preenche receitas ausentes, mas preserva os snapshots existentes. Isso evita substituir, ao abrir o orçamento, as adaptações do móvel pela receita atual do catálogo.

`orcamentos.valor_venda` contém o valor líquido negociado, com o desconto já aplicado. A geração das contas a receber usa esse valor diretamente, inclusive em aditivos, sem descontar novamente o valor registrado em `pagamento.desconto`.

## Premissas construtivas

O orçamento rápido estima consumo por receitas e medidas; não faz modelagem 3D nem otimização geométrica do plano de corte.

- O móvel de pia é identificado como **fundo aberto**. A receita remove o tampo e o fundo inteiros e inclui duas travessas superiores de 100 mm.
- As frentes do gaveteiro pronto são distribuídas pela altura com folgas explícitas. A caixa da gaveta fica mais baixa que sua frente, conforme os parâmetros do preset. A distribuição automática continua válida ao mudar a altura ou a quantidade de gavetas após abrir a composição livre; medidas manuais permanecem manuais.
- Nos modelos prontos, tamponamentos automáticos ficam vazios e laterais, rodapés e fechamentos são lançados como complementos independentes. Nas caixas escolhidas livremente, as peças e os tamponamentos da receita são preservados e podem ser desabilitados no editor; confira a composição antes de acrescentar uma peça equivalente como complemento.
- As métricas de junção e mão de obra mantêm o método estimativo do ERP. Não representam medições reais de fábrica.

Antes da fabricação, conferir construção, medidas finais, folgas, ferragens, obstáculos, apoios e plano de corte no fluxo técnico da marcenaria. Calibre a precisão comercial comparando alguns projetos concluídos com os consumos e custos reais; esta implementação não estabelece uma margem de erro universal.

## Prévia isolada

`preview/quick-quote/` monta a mesma página React com `createDemoQuickQuoteAdapter`. Materiais, clientes, preços e taxas são explicitamente fictícios. A demonstração salva somente no armazenamento local do navegador e oferece uma proposta demonstrativa para impressão e exportação dos dados. Não há conexão com a API ou o banco da marcenaria.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:quick-quote
npm run build
npm run build:quick-preview
```

O último comando gera `dist-quick-quote/`. O build normal continua em `dist/`. A instalação com `--ignore-scripts` serve à verificação do frontend neste trabalho; uma instalação operacional do backend deve seguir o procedimento existente do projeto para suas dependências nativas.

Os testes deste recurso usam Node e dados sintéticos, sem importar `server/db.js`, iniciar serviços ou acessar dados de produção. Cobrem receitas, composição livre, herança de materiais, escolhas individuais e globais de ferragens, unidades e metragem, multiplicidades, validações, desconto líquido, contrato da API com cliente simulado e salvamento local da prévia. As compilações verificam a integração do frontend. A homologação com a API real e a conferência visual em navegador continuam como etapas do ambiente de teste antes da adoção em produção.
