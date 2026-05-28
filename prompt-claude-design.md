# Prompt para Claude — Design do Plugin SketchUp (Ornato ERP)

---

Você é um designer de interfaces especializado em ferramentas desktop para arquitetura e marcenaria. Vou te apresentar o contexto completo do sistema e preciso que você projete a interface do Plugin SketchUp integrado ao Ornato ERP.

---

## Contexto do Sistema

O Ornato ERP é um sistema de gestão completo para marcenarias e empresas de moveis planejados, desenvolvido em React + Node.js. Ele cobre todo o ciclo do negocio: captacao de lead, orcamento, producao CNC, financeiro e portal do cliente.

### Identidade Visual do Sistema

- **Cor primaria**: `#1379F0` (azul)
- **Cor de destaque**: `#C9A96E` (cobre/rose gold — usada em propostas e documentos premium)
- **Fundo do sistema**: `#0b0e13` (preto-azulado escuro)
- **Fundo de cards/paineis**: `#111318`
- **Fundo de elementos secundarios**: `#1a1e26`
- **Texto principal**: `rgba(255,255,255,0.92)`
- **Texto secundario**: `rgba(255,255,255,0.60)`
- **Bordas**: `rgba(255,255,255,0.08)`
- **Fonte**: Inter (sans-serif)
- **Border radius padrao**: 8px em cards, 6px em inputs, 20px em badges
- **Sem emojis em nenhum elemento de interface**
- **Sem sombras excessivas — design flat com bordas sutis**
- **Icones**: estilo Lucide (stroke, nao filled, peso 1.5px)

### Fluxo do Plugin no ERP

O plugin roda dentro do SketchUp (Ruby + dialogo HTML/CSS/JS) e se comunica com o servidor do ERP via API REST (Bearer Token JWT). O fluxo completo e:

1. Projetista modela os moveis no SketchUp (caixas, armarios, paineis)
2. Abre o plugin dentro do SketchUp
3. Faz login com as credenciais do ERP
4. Seleciona ou cria um orcamento no ERP
5. Mapeia os componentes do modelo SketchUp para os modulos do catalogo do ERP
6. Define materiais (chapa, espessura, fita de borda) por peca ou por ambiente
7. Exporta todas as pecas com dimensoes reais (largura, altura, profundidade em mm)
8. O plugin envia os dados para o ERP, gerando automaticamente:
   - Lista de pecas do orcamento
   - Plano de corte (lote CNC)
   - BOM (bill of materials)
9. O projetista pode sincronizar alteracoes do modelo de volta para o ERP

### Estrutura de Dados de uma Peca Exportada

```json
{
  "nome": "Lateral Esquerda",
  "largura": 550,
  "altura": 720,
  "espessura": 15,
  "material_id": 42,
  "material_nome": "MDF Branco TX 15mm",
  "fita_frente": true,
  "fita_tras": false,
  "fita_cima": true,
  "fita_baixo": true,
  "quantidade": 2,
  "ambiente": "Cozinha",
  "modulo": "Armario Aereo 60cm",
  "observacoes": ""
}
```

### Catalogo de Materiais (simplificado)

Chapas disponíveis sao carregadas da API do ERP:
- MDF Branco TX 15mm
- MDF Branco TX 18mm
- MDF Amadeirado Nogal 15mm
- MDF Laqueado Off-White 18mm
- Compensado Naval 15mm
- MDF Fundo 3mm / 6mm

---

## O que Precisa ser Desenhado

Projete a **interface completa do plugin SketchUp**, que roda como um dialogo flutuante dentro do SketchUp (painel lateral ou janela modal). O plugin deve ter as seguintes telas/estados:

### Tela 1 — Login / Conexao com o ERP

- Campo de URL do servidor (ex: `https://studioornato.com.br`)
- Campo de e-mail
- Campo de senha (com toggle show/hide)
- Botao "Conectar ao ERP"
- Estado de loading durante a conexao
- Estado de erro com mensagem clara
- Versao do plugin no rodape (ex: `v2.1.4`)
- Logo "Ornato" no topo

### Tela 2 — Painel Principal (apos login conectado)

Estrutura em abas ou secoes verticais:

#### Aba: Projeto

- Selector de orcamento existente (dropdown com busca — mostra numero + cliente + ambiente)
- Ou botao para criar novo orcamento no ERP
- Informacoes do orcamento selecionado: cliente, ambiente, valor atual, status
- Indicador de sincronizacao: "Ultima sincronizacao: ha 5 minutos" ou "Nao sincronizado"

#### Aba: Pecas

- Lista de componentes detectados no modelo SketchUp atual
- Cada linha mostra: nome do componente, dimensoes detectadas (L x A x E), status de mapeamento (mapeado/nao mapeado)
- Botao "Detectar Pecas do Modelo" (roda o script Ruby que le o SketchUp)
- Botao "Selecionar Tudo" / "Deselecionar Tudo"
- Checkboxes por peca para incluir/excluir da exportacao
- Indicador de quantidade total de pecas e m² total

#### Aba: Materiais

- Atribuicao de material por ambiente (ex: "Cozinha" → MDF Branco TX 18mm)
- Override por peca individual (expandir peca e selecionar material diferente)
- Configuracao de fita de borda por face (frente, tras, cima, baixo) — 4 toggles por peca ou em massa
- Preview do custo estimado de material baseado nos precos do catalogo

#### Aba: Exportar

- Resumo do que sera exportado: X pecas, Y ambientes, Z m² de chapa
- Alertas de validacao (pecas sem material, dimensoes zeradas, etc.)
- Opcao: "Substituir pecas existentes" vs "Adicionar a pecas existentes"
- Botao principal "Exportar para o ERP" (destaque em azul primario)
- Log de exportacao em tempo real (linha por linha conforme envia)
- Estado de sucesso com link para abrir o orcamento no navegador
- Estado de erro com detalhe do que falhou

### Tela 3 — Mapeamento de Componentes

Tela intermediaria acionada quando ha componentes nao reconhecidos. Mostra:

- Lista de componentes do SketchUp sem mapeamento
- Para cada um: campo para definir nome da peca, categoria (lateral, fundo, prateleira, porta, tampo, gaveta, especial) e se e estrutural ou decorativo
- Botao "Salvar Mapeamentos" e "Pular"

### Tela 4 — Sincronizacao

Tela para quando o modelo foi alterado apos exportacao:

- Diff visual: pecas novas (verde), pecas removidas (vermelho), pecas alteradas (amarelo)
- Cada linha mostra o que mudou: "Lateral Esq: altura 700 → 750mm"
- Botao "Sincronizar Alteracoes" e "Cancelar"

---

## Restricoes Tecnicas e de Design

- **O plugin roda em um dialogo HTML/CSS/JS dentro do SketchUp** — nao e uma pagina web normal. A janela tipicamente tem **280px a 380px de largura** e altura variavel (600px a 900px). Projete para esse formato estreito e vertical.
- **Sem frameworks externos** — o CSS deve ser puro ou com Tailwind inline. Sem dependencia de CDN para funcionar offline.
- **Performance**: o plugin deve carregar rapido. Nada pesado.
- **Sem emojis** em nenhuma parte da interface — use apenas icones SVG do estilo Lucide.
- **Sem gradientes excessivos** — fundo escuro solido com variações leves de luminosidade entre camadas.
- **Tipografia**: Inter, tamanhos entre 11px e 13px para a maioria dos textos (dialogo pequeno).
- **Sem bordas arredondadas exageradas** — maximo 8px.
- **Botoes primarios**: fundo `#1379F0`, texto branco, hover com leve clareamento.
- **Botoes secundarios**: fundo `rgba(255,255,255,0.06)`, borda `rgba(255,255,255,0.10)`, texto `rgba(255,255,255,0.75)`.
- **Inputs**: fundo `rgba(255,255,255,0.05)`, borda `rgba(255,255,255,0.10)`, focus com borda `#1379F0`.
- **Estados de loading**: spinner CSS simples (borda com rotacao), sem skeletons complexos.
- **Mensagens de erro**: fundo `rgba(239,68,68,0.10)`, borda esquerda `3px solid #ef4444`, texto `rgba(255,255,255,0.80)`.
- **Mensagens de sucesso**: fundo `rgba(34,197,94,0.10)`, borda esquerda `3px solid #22c55e`.

---

## O que Entregar

1. **Design completo em HTML/CSS** de cada tela descrita acima — codigo funcional que eu possa abrir no navegador para revisar o visual.
2. O HTML deve ser **auto-contido** (tudo inline ou em uma tag `<style>`).
3. Simule os estados com diferentes secoes ou botoes de alternancia entre telas.
4. Inclua comentarios no codigo explicando cada bloco.
5. O design deve parecer **profissional, limpo e consistente** com a identidade do Ornato ERP descrita acima.
6. Priorize **clareza e usabilidade** — o projetista usa o plugin enquanto trabalha no SketchUp, nao pode ter distracao ou interface confusa.

---

## Tom e Linguagem da Interface

- Todos os textos em **portugues brasileiro**
- Tom tecnico mas acessivel — o usuario e um projetista/marceneiro, nao um engenheiro de software
- Labels curtas e diretas: "Exportar", "Conectar", "Detectar Pecas", "Sincronizar"
- Mensagens de erro explicam o problema e sugerem a solucao: "Nao foi possivel conectar. Verifique a URL do servidor e sua conexao com a internet."
- Sem jargoes de TI desnecessarios

---

Entregue o codigo HTML completo das telas do plugin, priorizando fidelidade visual a identidade Ornato e usabilidade no formato de janela estreita do SketchUp.
