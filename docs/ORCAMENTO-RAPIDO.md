# Orçamento rápido no ORNATOERP

## Uso

A nova entrada **Comercial → Orçamento rápido** e o botão em **Orçamentos** abrem `/orcamento-rapido`. A tela usa a permissão existente de orçamentos. Nenhuma migração de banco é necessária.

1. Selecione um cliente cadastrado e informe o projeto.
2. Escolha os materiais do corpo, fundo e frentes e, se necessário, os padrões de dobradiças e corrediças.
3. Adicione balcões, gaveteiros, aéreos ou nichos. Ajuste largura, altura, profundidade e quantidade, em milímetros.
4. Abra a composição de um móvel para ajustar portas, gavetas, prateleiras e folgas disponíveis.
5. Inclua laterais, rodapés e fechamentos como peças complementares explícitas.
6. Confira os insumos, custo de fabricação, taxas e preço de venda. Salve ou abra o editor completo.

A tela autenticada começa vazia. O botão de exemplo adiciona uma cozinha com 3.000 mm de inferiores e 3.000 mm de aéreos: pia de 1.200 mm, gaveteiro de 600 mm, balcão de 1.200 mm, dois aéreos de 1.200 mm e um aéreo de 600 mm. São cinco linhas e seis móveis. Os complementos devem ser acrescentados conforme o projeto.

## Catálogo e preços

Os presets usam os cadastros existentes, resolvidos por nome normalizado e identificação no catálogo:

| Receita | Cadastro necessário |
| --- | --- |
| Inferiores e gaveteiro | Caixa Baixa / Balcão |
| Aéreos e nicho | Caixa Aérea |
| Portas | Porta |
| Gavetas | Gaveta |
| Prateleiras | Prateleira |

Um cadastro ausente ou com nome duplicado deixa o preset indisponível e indica a pendência. Se o catálogo instalado usa outros nomes, ajuste o mapeamento em `src/quickQuote.js` para as receitas equivalentes; não crie preços ou receitas fictícios no cadastro de produção.

`src/quickQuoteAdapter.js` lê `/clientes`, `/catalogo?tipo=caixa`, `/catalogo?tipo=componente`, `/biblioteca` e `/config/taxas` pelo cliente autenticado existente. O salvamento usa `POST /orcamentos` para criar um rascunho e `PUT /orcamentos/:id` para atualizá-lo. O custo e o preço são recalculados a partir dos itens antes de montar o payload. O editor completo recebe o registro retornado pela API.

No orçamento rápido, `strictCatalog: true` impede concluir o preço com insumos que só existam na biblioteca embutida do código. Materiais, ferragens, fórmulas e valores inválidos apresentam pendências. Os padrões herdados do editor completo permanecem disponíveis para os orçamentos antigos, com os avisos correspondentes.

## Cálculo compartilhado e compatibilidade

`src/quoteCalculator.js` reúne a normalização da biblioteca, resolução de materiais, agregação de custos e aplicação do desconto. Tanto a tela rápida quanto `Novo.jsx` chamam esse módulo. As categorias, coeficientes, markups, custos proporcionais ou por hora, consumíveis e divisor comercial existentes no ERP continuam sendo utilizados.

As contagens de peças, metros de fita, bordas, portas e junções respeitam as multiplicidades da composição. Perda de chapa igual a zero é preservada. “Lucro configurado” é um parâmetro da fórmula do ERP, não a margem efetivamente apurada do negócio.

O orçamento salva snapshots de caixa e componentes. O editor completo preenche receitas ausentes, mas preserva os snapshots existentes. Isso evita substituir, ao abrir o orçamento, as adaptações do móvel pela receita atual do catálogo.

`orcamentos.valor_venda` contém o valor líquido negociado, com o desconto já aplicado. A geração das contas a receber usa esse valor diretamente, inclusive em aditivos, sem descontar novamente o valor registrado em `pagamento.desconto`.

## Premissas construtivas

O orçamento rápido estima consumo por receitas e medidas; não faz modelagem 3D nem otimização geométrica do plano de corte.

- O móvel de pia é identificado como **fundo aberto**. A receita remove o tampo e o fundo inteiros e inclui duas travessas superiores de 100 mm.
- As frentes do gaveteiro são distribuídas pela altura com folgas explícitas. A caixa da gaveta fica mais baixa que sua frente, conforme os parâmetros do preset.
- Tamponamentos automáticos dos módulos ficam vazios. Laterais, rodapés e fechamentos são lançados uma vez como complementos independentes.
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

Os testes deste recurso usam Node e dados sintéticos, sem importar `server/db.js`, iniciar serviços ou acessar dados de produção. Cobrem receitas, cálculos, multiplicidades, validações, desconto líquido, contrato da API com cliente simulado e salvamento local da prévia. As compilações verificam a integração do frontend. A homologação com a API real e a conferência visual em navegador continuam como etapas do ambiente de teste antes da adoção em produção.
