# Prompt para Claude — Rebranding Completo Ornato ERP

---

Voce e um designer de produto senior especializado em sistemas SaaS B2B, ferramentas desktop e experiencias digitais de alto padrao para o mercado de arquitetura, construcao e design de interiores. Preciso que voce projete o **rebranding visual completo** do Ornato ERP — um sistema de gestao para marcenarias e empresas de moveis planejados.

Este e um projeto de design de sistema completo, nao apenas uma pagina. Quero que voce entregue o design system e todas as interfaces descritas abaixo em HTML/CSS auto-contido.

---

## 1. A Empresa

**Ornato** e uma empresa de moveis planejados premium. O nome vem do latim *ornatus* — ornamentado, refinado, bem-acabado. O posicionamento e:

- Publico-alvo dos clientes finais: familias de classe media-alta e alta, arquitetos, construtoras
- Diferencial: precisao de execucao, acabamento impecavel, tecnologia CNC propria
- Tom de voz: confiante, tecnico quando necessario, nunca pomposo
- Valores: precisao, clareza, sofisticacao discreta

O sistema ERP e usado internamente pela equipe da Ornato (gestores, vendedores, projetistas, operadores de CNC) e parcialmente pelos clientes finais (portal do cliente, proposta publica).

---

## 2. Identidade Visual Atual (a ser evoluida, nao descartada)

- **Cor primaria atual**: `#1379F0` (azul medio)
- **Cor de destaque atual**: `#C9A96E` (cobre/rose gold — usada em propostas e documentos)
- **Fundo atual do sistema**: `#0b0e13`
- **Fonte atual**: Inter

O rebranding deve **evoluir** essa identidade, nao apagar. O azul e o cobre sao ativos da marca. O que pode mudar: refinamento dos tons, hierarquia tipografica, espacamento, densidade visual, componentes.

---

## 3. Premissas de Design (nao negociaveis)

- **Sem emojis em nenhuma interface** — zero, absolutamente nenhum
- **Sem gradientes de arco-iris ou multicoloridos** — gradientes apenas sutis e monocromaticos quando usados
- **Tema escuro** em todas as interfaces internas do sistema (ERP)
- **Tema claro OU escuro** nas paginas publicas (proposta, portal, landing) — voce decide o que funciona melhor para cada uma
- **Icones**: exclusivamente estilo Lucide (stroke, peso 1.5px, sem fill) ou equivalente outline
- **Tipografia**: Inter para o sistema interno; para as paginas publicas voce pode propor outra fonte de display (sem serifa, refinada)
- **Densidade**: o sistema interno deve ser denso e informativo (muitos dados na tela). As paginas publicas devem ser arejadas e de alto impacto visual
- **Sem bordas arredondadas exageradas** — maximo 10px em cards, 6px em inputs, 4px em badges
- **Sem sombras pesadas** — elevacao indicada por variacao de cor de fundo, nao por box-shadow excessivo
- **Acessibilidade**: contraste minimo 4.5:1 em textos principais
- **Responsividade**: sistema interno funciona em desktop (1280px+) e tablet (768px+). Paginas publicas funcionam em qualquer dispositivo

---

## 4. O Sistema — Visao Geral

O Ornato ERP cobre o ciclo completo do negocio:

```
Lead → Qualificacao → Orcamento → Proposta → Aprovacao do Cliente
  → Projeto → Compras → CNC / Producao → Expedicao → Entrega → Financeiro
```

Modulos internos (area logada):
Dashboard, Funil de Leads, Clientes (CRM), Orcamentos, Editor de Orcamento,
Pipeline Kanban, Projetos (com Gantt), Financeiro, Estoque, Compras,
Biblioteca de Materiais, Engenharia de Modulos, WhatsApp/Mensagens,
Assistente IA, Corte & CNC, Industrializacao, Oficina (chao de fabrica),
Expedicao, Relatorios, Ponto, Gestao Avancada, Configuracoes, Usuarios

Paginas publicas (sem login):
Landing Page da empresa, Proposta Publica, Portal do Cliente,
Landing Page da Proposta, Plugin SketchUp (pagina de download)

---

## 5. Design System — O que Entregar

### 5.1 Tokens de Design (variaveis CSS)

Defina um sistema de tokens completo com:

- Escala de cores (primaria em 10 tons, neutros em 12 tons, semanticas: sucesso, erro, alerta, info)
- Escala tipografica (xs, sm, base, lg, xl, 2xl, 3xl, display)
- Escala de espacamento (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)
- Escala de border-radius
- Escala de z-index
- Tokens semanticos mapeados sobre os primitivos (ex: `--color-surface-primary`, `--color-text-muted`, `--color-border-default`)

### 5.2 Componentes Base

Projete e entregue em HTML/CSS cada um dos componentes abaixo no tema escuro:

**Inputs e Formularios**
- Input de texto (estados: default, focus, error, disabled, com icone a esquerda, com sufixo a direita)
- Textarea
- Select / Dropdown (com opcoes visiveis)
- SearchableSelect (campo de busca + lista de opcoes filtradas)
- Checkbox e Radio
- Toggle Switch
- Date picker (apenas visual)
- Slider de range

**Botoes**
- Primary, Secondary, Ghost, Destructive
- Tamanhos: sm, md, lg
- Estados: default, hover, active, loading (spinner inline), disabled
- Icon button (somente icone, quadrado)
- Button group

**Feedback e Status**
- Badge (variantes: default, primary, success, warning, error, outline)
- Tag (removivel)
- Alert / Callout (info, success, warning, error)
- Toast / Notification (canto superior direito)
- Progress bar
- Skeleton loader (retangulo animado)
- Spinner (circular, tamanhos sm/md/lg)
- Empty state (icone + titulo + descricao + acao)

**Navegacao**
- Sidebar completa com grupos colapsaveis, item ativo, item com badge, avatar do usuario, logo no topo
- Topbar com busca global, sino de notificacoes, avatar
- Tab bar (horizontal, variante pill e linha)
- Breadcrumb
- Pagination

**Dados**
- Table com cabecalho, linhas zebradas, linha hover, coluna de acoes, checkbox de selecao
- Card de KPI (numero grande + label + variacao percentual + mini sparkline)
- Stat row (label + valor inline)
- List item (icone + titulo + subtitulo + acao)

**Overlays**
- Modal (tamanhos: sm, md, lg, fullscreen)
- Drawer lateral (slide-in da direita)
- Popover
- Tooltip
- Context menu / Dropdown menu

**Layout**
- Page header (titulo + subtitulo + acoes no lado direito)
- Section header (titulo de secao + separador)
- Divider
- Card container (fundo ligeiramente mais claro que o fundo da pagina)
- Split pane (dois paineis lado a lado)

---

## 6. Interfaces Completas — O que Entregar

Para cada interface abaixo, entregue o HTML/CSS completo e funcional (abrivel no navegador). Use dados ficticiios realistas (nomes, valores, datas brasileiras).

---

### Interface 1 — Tela de Login

Pagina de autenticacao do sistema interno.

Elementos obrigatorios:
- Logo Ornato no topo (tipografico ou com icone — voce decide)
- Titulo: "Entrar no sistema"
- Campo: E-mail
- Campo: Senha (com toggle show/hide)
- Botao: "Entrar"
- Link: "Esqueci minha senha"
- Rodape com versao do sistema e ano
- Sem imagem de fundo excessiva — fundo escuro com elemento grafico sutil (geometrico, nao fotografico)
- Estado de loading no botao apos submit

---

### Interface 2 — Dashboard (tela inicial pos-login)

Visao geral executiva do negocio.

Elementos obrigatorios:
- Sidebar completa a esquerda (tema escuro, cor primaria como fundo)
- Topbar com busca global, notificacoes (badge com numero), avatar do usuario logado
- Saudacao: "Bom dia, Victor" + data atual
- Barra de KPIs executivos (5 cards em linha):
  - Faturamento do Mes (com variacao % vs mes anterior e mini grafico de linha)
  - Pipeline Ativo (valor em R$)
  - Projetos Ativos (numero)
  - Contas Vencidas (valor, destaque vermelho se > 0)
  - Pecas na Producao (numero)
- Secao: Orcamentos Recentes (tabela com 5 linhas: numero, cliente, valor, status, data)
- Secao: Projetos em Andamento (3 cards com progresso visual, nome do cliente, prazo)
- Secao: Alertas (lista de notificacoes pendentes: estoque baixo, conta vencida, proposta visualizada)

---

### Interface 3 — Editor de Orcamento

O modulo mais complexo do sistema. O projetista cria o orcamento aqui.

Layout: sidebar esquerda fixa com lista de itens + area principal de edicao + painel direito colapsavel de detalhes

Elementos obrigatorios:
- Header com: numero do orcamento (ORN-2026-00024), nome do cliente, ambiente, status badge, botoes de acao (Proposta, Contrato, Materiais, Salvar)
- Painel esquerdo: lista de modulos adicionados (cada um com nome, dimensoes, valor calculado, acoes rapidas de editar/duplicar/remover)
- Botao "+ Adicionar Modulo" na base do painel esquerdo
- Area central: formulario de edicao do modulo selecionado
  - Nome do modulo
  - Dimensoes: Altura (mm), Largura (mm), Profundidade (mm) — inputs numericos grandes
  - Material externo (SearchableSelect)
  - Material interno (SearchableSelect)
  - Puxador (SearchableSelect)
  - Categoria (grid de botoes com icone: Cozinha, Quarto, Banheiro, Sala, Closet, Escritorio)
  - Sub-itens / ferragens: lista com quantidade e valor unitario
- Painel direito: resumo financeiro
  - Custo de material
  - MDO (mao de obra)
  - Taxas (imposto, comissao, montagem, lucro)
  - Valor de venda (destaque)
  - Margem %
  - Botao "Ver Proposta"

---

### Interface 4 — Pipeline Kanban

Visao de todos os orcamentos por etapa de venda.

Elementos obrigatorios:
- Layout horizontal com colunas em scroll
- 9 colunas: Lead, Orcamento, Enviado, Negociacao, Aprovado, Producao, Montagem, Arquivo, Perdido
- Cada coluna com: header colorido com nome + total de cards + valor somado
- Cards de orcamento: numero, nome do cliente, ambiente, valor em R$, data de criacao, badge de status
- Cards arrastáveis (visual apenas — cursor grab, card com leve elevacao no "drag state")
- Botao "+ Novo Orcamento" no topo
- Filtro por busca e periodo

---

### Interface 5 — Lista de Projetos (Gantt)

Visao de projetos ativos com grafico de Gantt.

Elementos obrigatorios:
- Lista de projetos na metade esquerda: nome do cliente, ambiente, progresso %, prazo, status badge (no prazo / atencao / atrasado)
- Grafico de Gantt na metade direita: barras horizontais por etapa (Medicao, Compras, Producao, Acabamento, Entrega), linha vertical "hoje", barras com cor de status
- Projeto selecionado destacado nas duas metades
- Filtros: status, periodo, responsavel

---

### Interface 6 — Oficina (Chao de Fabrica)

Kanban de producao para uso no tablet da fabrica.

Elementos obrigatorios:
- 5 colunas: Corte, Cola de Borda, Pre-Montagem, Acabamento, Expedicao
- Cards grandes (otimizados para toque): nome do projeto, cliente, ambiente, prazo (dias restantes ou "atrasado" em vermelho), barra de progresso
- Cada coluna tem cor de cabecalho distinta e contador de cards
- Botao de modo TV (tela cheia sem interacao, para monitor na parede da fabrica)
- Header minimalista (sem sidebar — tela cheia de trabalho)

---

### Interface 7 — Financeiro

Gestao de contas a pagar e receber.

Elementos obrigatorios:
- Tabs no topo: Contas a Pagar / Contas a Receber / Fluxo de Caixa
- Na aba Contas a Pagar:
  - Resumo no topo: total vencido (vermelho), total a vencer em 7 dias (amarelo), total do mes, pago no mes
  - Tabela com colunas: descricao, fornecedor, vencimento, valor, status, acoes
  - Filtros: status, categoria, periodo
  - Botao "+ Nova Conta"
  - Modal de cadastro de conta (campo por campo)
- Status visual nas linhas: linha vermelha sutil para vencidas, linha amarela para proximas

---

### Interface 8 — Proposta Publica (pagina do cliente)

Pagina acessada pelo cliente via link. Sem login. Design de alto impacto.

Esta pagina pode ter tema claro ou escuro — voce decide o que melhor representa premium. A identidade da Ornato (azul + cobre) deve aparecer de forma elegante.

Elementos obrigatorios:
- Header fixo: logo da empresa + nome da proposta + botao "Aprovar Proposta" (CTA principal)
- Secao Hero: foto ou visual de fundo (placeholder), titulo grande "Proposta para Diego e Tamara", subtitulo com ambiente e data
- Secao: Resumo da Proposta (valor total em destaque, condicoes de pagamento, validade)
- Secao: Itens da Proposta (tabela ou cards com: modulo, dimensoes, material, valor)
- Secao: Sobre o Projeto (texto descritivo, prazo estimado)
- Secao: Aprovacao (checkbox de aceite dos termos + botao grande "Aprovar Proposta")
- Footer com dados da empresa e CNPJ
- Barra de validade no topo (ex: "Esta proposta vence em 12 dias")
- Indicador de rastreamento discreto (apenas visual — icone de olho + "Proposta visualizada")

---

### Interface 9 — Portal do Cliente (acompanhamento de obra)

Pagina acessada pelo cliente via link unico. Sem login. Mostra o progresso do projeto em tempo real.

Elementos obrigatorios:
- Header com logo da empresa + "Portal do Cliente" + nome do cliente
- Hero com nome do projeto e progresso visual (barra ou circulo de progresso %)
- Timeline de etapas com icones:
  - Medicao (concluida)
  - Compras de Material (concluida)
  - Producao CNC (em andamento — destaque animado)
  - Acabamento (pendente)
  - Entrega e Instalacao (pendente)
- Cada etapa: status, data prevista, responsavel, notes
- Galeria de fotos de progresso (grid de fotos com caption e data)
- Card financeiro: valor total, valor pago, saldo pendente, proxima parcela com data
- Secao de mensagens: campo para cliente enviar mensagem + historico de mensagens (estilo chat, sem WhatsApp)
- Footer com contato da empresa

---

### Interface 10 — Landing Page da Empresa (studioornato.com.br)

Pagina publica de apresentacao da empresa. Design premium, voltado para clientes finais que chegam por anuncio ou indicacao.

Secoes obrigatorias:
- **Hero**: titulo de impacto ("Moveis planejados com precisao CNC"), subtitulo, botao de CTA ("Solicitar Orcamento"), foto ou visual de fundo de alta qualidade (pode ser placeholder escuro com textura)
- **Diferenciais**: 4 cards com icone, titulo e descricao (ex: Precisao CNC, Prazo garantido, Materiais certificados, Projeto personalizado)
- **Portfolio**: grid de projetos realizados (fotos com overlay de hover mostrando nome do projeto e ambiente)
- **Processo**: etapas numeradas de como funciona (Visita tecnica → Projeto 3D → Aprovacao → Producao → Instalacao)
- **Depoimentos**: cards de depoimentos de clientes com nome e cidade
- **CTA Final**: secao com fundo de destaque, titulo convidativo e formulario simples (nome, telefone, mensagem)
- **Footer**: logo, links, redes sociais, CNPJ, endereco

---

### Interface 11 — Plugin SketchUp

O plugin roda dentro do SketchUp como um dialogo HTML/CSS/JS. A janela tem **280px a 380px de largura** e 600px a 900px de altura — formato estreito e vertical. Nao e uma pagina web normal.

**Tela 1 — Login / Conexao**
- Logo Ornato (compacto)
- Campo: URL do servidor
- Campo: E-mail
- Campo: Senha (toggle show/hide)
- Botao: "Conectar ao ERP"
- Estado de loading e estado de erro
- Versao do plugin no rodape

**Tela 2 — Painel Principal (pos-login)**

Navegacao por abas compactas no topo:

*Aba: Projeto*
- Selector de orcamento (dropdown com busca: numero + cliente)
- Info do orcamento selecionado: cliente, ambiente, valor, status
- Ultima sincronizacao: "ha 5 minutos" ou "Nao sincronizado"
- Botao "Abrir no navegador"

*Aba: Pecas*
- Botao "Detectar Pecas do Modelo" (acao principal)
- Lista de pecas detectadas: nome, dimensoes (L x A x E em mm), status de mapeamento
- Checkboxes para incluir/excluir
- Rodape: "23 pecas selecionadas — 8.4 m²"

*Aba: Materiais*
- Por ambiente: dropdown de material padrao
- Override por peca (expansivel)
- 4 toggles de fita de borda por peca (F T C B — frente, tras, cima, baixo)
- Custo estimado

*Aba: Exportar*
- Resumo: X pecas, Y ambientes, Z m²
- Alertas de validacao
- Opcao: Substituir ou Adicionar
- Botao grande "Exportar para o ERP"
- Log de exportacao linha a linha
- Estado de sucesso com link para abrir no navegador

**Tela 3 — Mapeamento de Componentes**
- Componentes nao reconhecidos do modelo
- Por componente: nome livre, categoria (lateral, fundo, prateleira, porta, tampo, gaveta, especial)
- Botao "Salvar" e "Pular"

**Tela 4 — Sincronizacao**
- Diff: pecas novas (verde), removidas (vermelho), alteradas (amarelo)
- Cada linha: nome da peca + o que mudou ("altura 700 → 750mm")
- Botoes: "Sincronizar" e "Cancelar"

---

### Interface 12 — Pagina de Download do Plugin SketchUp (no site)

Pagina publica do site do ERP onde a equipe faz o download do plugin.

Elementos obrigatorios:
- Hero: titulo "Plugin SketchUp para Ornato ERP", subtitulo tecnico, badge de versao atual (ex: v2.1.4), botao "Baixar Plugin (.rbz)"
- Secao: Requisitos do sistema (SketchUp 2021+, Windows 10+, conexao com internet)
- Secao: Como instalar (passos numerados com ilustracao ou screenshot placeholder)
- Secao: Funcionalidades (lista de o que o plugin faz)
- Secao: Historico de versoes (tabela: versao, data, o que mudou)
- Secao: Suporte (contato, link para documentacao)

---

## 7. Especificacoes Tecnicas do HTML Entregue

- Cada interface deve ser um HTML separado, auto-contido, com todo CSS na tag `<style>`
- Usar variaveis CSS (`--color-primary`, etc.) mapeadas no `:root` de cada arquivo
- Dados ficticios realistas em portugues brasileiro (nomes, valores em R$, datas no formato DD/MM/AAAA)
- Nenhuma dependencia de CDN externo (exceto Google Fonts se necessario)
- Icones: SVG inline do estilo Lucide — nao usar imagens externas
- O HTML deve ser comentado por secao
- Estados interativos (hover, focus, active) devem ser definidos no CSS mesmo sem JavaScript
- Simular multiplos estados dentro do mesmo arquivo usando secoes separadas ou classes modificadoras visíveis

---

## 8. Valores de CSS de Referencia

Use como ponto de partida (voce pode evoluir):

```css
/* Fundos */
--bg-app: #0b0e13;
--bg-surface: #111318;
--bg-elevated: #1a1e26;
--bg-overlay: #20242e;

/* Primaria */
--primary-50: #e8f1fe;
--primary-100: #c3d8fd;
--primary-500: #1379F0;
--primary-600: #1068d4;
--primary-700: #0d58b3;

/* Destaque */
--accent: #C9A96E;
--accent-muted: rgba(201, 169, 110, 0.15);

/* Texto */
--text-primary: rgba(255, 255, 255, 0.92);
--text-secondary: rgba(255, 255, 255, 0.60);
--text-muted: rgba(255, 255, 255, 0.38);
--text-disabled: rgba(255, 255, 255, 0.22);

/* Bordas */
--border-default: rgba(255, 255, 255, 0.08);
--border-subtle: rgba(255, 255, 255, 0.05);
--border-strong: rgba(255, 255, 255, 0.15);

/* Semanticas */
--success: #22c55e;
--warning: #f59e0b;
--error: #ef4444;
--info: #3b82f6;

/* Inputs */
--input-bg: rgba(255, 255, 255, 0.05);
--input-border: rgba(255, 255, 255, 0.10);
--input-focus-border: #1379F0;
```

---

## 9. Ordem de Entrega Sugerida

Se precisar priorizar, entregue nesta ordem:

1. Design System (tokens + componentes base) — estabelece a linguagem visual de tudo
2. Login
3. Dashboard
4. Editor de Orcamento (mais complexo, define a densidade do sistema)
5. Pipeline Kanban
6. Proposta Publica
7. Portal do Cliente
8. Landing Page
9. Plugin SketchUp (telas 1 a 4)
10. Pagina de Download do Plugin
11. Oficina
12. Financeiro
13. Projetos / Gantt

---

## 10. O que Nao Fazer

- Nao usar Bootstrap, Material UI, Ant Design ou qualquer framework de componentes — CSS puro ou Tailwind inline
- Nao usar emojis em nenhuma interface, em nenhum momento
- Nao usar gradientes de multiplas cores
- Nao usar imagens externas — placeholders com fundo e texto centralizado
- Nao usar `!important` sem necessidade
- Nao criar layouts que dependam de JavaScript para funcionar visualmente
- Nao usar fontes diferentes de Inter no sistema interno (nas paginas publicas pode propor outra)
- Nao deixar textos em ingles — tudo em portugues brasileiro
- Nao criar interfaces com muita whitespace vazia no sistema interno — o usuario e um profissional que precisa de densidade de informacao
- Nao simplificar demais — este e um sistema real e complexo, as interfaces devem refletir isso

---

Entregue os arquivos HTML um a um, comecando pelo Design System, depois Login, e assim em diante. A cada entrega, pergunte se ha ajustes antes de prosseguir para o proximo.
