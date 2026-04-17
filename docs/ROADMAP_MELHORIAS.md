# 🪵 ORNATO ERP — ROADMAP COMPLETO DE MELHORIAS
> Documento gerado em 23/02/2026
> Baseado em análise comparativa: Sistema Atual (Ornato) × Sistema Antigo × Sismarcenaria

---

## 📌 ÍNDICE

1. [Visão Geral](#1-visão-geral)
2. [Bugs Críticos a Corrigir Agora](#2-bugs-críticos-a-corrigir-agora)
3. [Módulo de Documentos e Contratos](#3-módulo-de-documentos-e-contratos)
4. [Configurações da Empresa e Logos](#4-configurações-da-empresa-e-logos)
5. [Editor de Modelos de Documentos](#5-editor-de-modelos-de-documentos)
6. [Sistema de Geração de PDF](#6-sistema-de-geração-de-pdf)
7. [Melhorias no Cadastro de Clientes](#7-melhorias-no-cadastro-de-clientes)
8. [Melhorias nos Orçamentos](#8-melhorias-nos-orçamentos)
9. [Melhorias na Biblioteca e Catálogo](#9-melhorias-na-biblioteca-e-catálogo)
10. [CRM com Histórico de Interações](#10-crm-com-histórico-de-interações)
11. [Ordem de Produção e Lotes de Corte](#11-ordem-de-produção-e-lotes-de-corte)
12. [Portal do Cliente](#12-portal-do-cliente)
13. [Melhorias de UX/UI](#13-melhorias-de-uxui)
14. [Melhorias Técnicas e de Segurança](#14-melhorias-técnicas-e-de-segurança)
15. [Roadmap por Fases](#15-roadmap-por-fases)
16. [Schema Completo do Banco de Dados](#16-schema-completo-do-banco-de-dados)

---

## 1. VISÃO GERAL

### Stack Atual
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Banco:** SQLite (better-sqlite3)
- **Auth:** JWT + RBAC (admin / gerente / vendedor)

### Pontuação Atual por Módulo

| Módulo | Nota Atual | Meta |
|---|---|---|
| Motor de Cálculo Paramétrico | ⭐⭐⭐⭐⭐ | Manter |
| Cadastro de Clientes | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Orçamentos | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Biblioteca / Catálogo | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Geração de Documentos | ❌ Zero | ⭐⭐⭐⭐⭐ |
| CRM / Pipeline | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Produção / Lotes | ❌ Zero | ⭐⭐⭐⭐⭐ |
| Portal do Cliente | ❌ Zero | ⭐⭐⭐⭐⭐ |
| UX / Interface | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Segurança / Infra | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 2. BUGS CRÍTICOS A CORRIGIR AGORA

> Estes são erros no código atual que afetam a experiência imediatamente.

### Bug 1 — Ícone errado no campo de busca de Clientes
**Arquivo:** `src/pages/Cli.jsx` — linha ~55
**Problema:** Aparece ícone de "caixa" (📦) no campo de pesquisa
**Correção:**
```jsx
// ❌ Errado
<Ic.Box />

// ✅ Correto
<Ic.Search />
```

---

### Bug 2 — Classe CSS inválida no Kanban
**Arquivo:** `src/pages/Kb.jsx` — múltiplas linhas
**Problema:** `"text-[var(--text-primary)]0"` — o `0` no final quebra o Tailwind, causando cor errada
**Correção:**
```jsx
// ❌ Errado
"text-[var(--text-primary)]0"

// ✅ Correto
"text-[var(--text-muted)]"
```

---

### Bug 3 — Duas paletas de azul conflitantes
**Arquivos:** `tailwind.config.js` e `src/index.css`
**Problema:** O Tailwind define `primary: '#2563EB'` mas o CSS define `--primary: #1379F0` — dois azuis diferentes usados ao mesmo tempo
**Correção:** Unificar para uma única cor em ambos os arquivos:
```js
// tailwind.config.js
primary: '#1379F0'  // usar o mesmo do index.css

// index.css
--primary: #1379F0  // manter
```

---

### Bug 4 — Logo com letra errada
**Arquivo:** `src/pages/Login.jsx` e `src/App.jsx`
**Problema:** O sistema se chama "Ornato" mas mostra a letra "S" no ícone
**Correção:** Trocar `S` por `O` ou pela logo real da empresa

---

### Bug 5 — `confirm()` nativo do browser para deletar
**Arquivo:** `src/pages/Cli.jsx` e outros
**Problema:** Abre janela cinza do sistema operacional, completamente fora do design
**Correção:** Criar componente `ModalConfirmacao` personalizado:
```jsx
// Criar src/components/ModalConfirmacao.jsx
export function ModalConfirmacao({ titulo, texto, onConfirmar, onCancelar }) {
  return (
    <Modal title={titulo} close={onCancelar}>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {texto}
      </p>
      <div className="flex justify-end gap-3">
        <button className={Z.btn2} onClick={onCancelar}>Cancelar</button>
        <button className={Z.btnD} onClick={onConfirmar}>Confirmar</button>
      </div>
    </Modal>
  )
}
```

---

### Bug 6 — Kanban anuncia drag-and-drop mas não tem
**Arquivo:** `src/pages/Kb.jsx`
**Problema:** Subtítulo diz "Arraste visualmente" mas só existem botões minúsculos (8px) que aparecem no hover
**Correção imediata (sem implementar DnD):**
```jsx
// Trocar o subtítulo:
// ❌ "Arraste visualmente entre etapas do funil de vendas"
// ✅ "Mova os cards entre etapas do funil de vendas"

// E tornar os botões sempre visíveis (não só no hover):
// Remover: opacity-0 group-hover:opacity-100
```
**Correção ideal (implementar DnD real):**
```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

---

## 3. MÓDULO DE DOCUMENTOS E CONTRATOS

> Inspirado no sistema Sismarcenaria. Um dropdown no orçamento gera qualquer documento em PDF com 1 clique.

### 3.1 Documentos a Implementar

| # | Documento | Descrição |
|---|---|---|
| 1 | **Orçamento** | PDF com logo, ambientes, valores, considerações finais e assinatura |
| 2 | **Ordem de Serviço** | Documento interno para a produção |
| 3 | **Termo de Entrega** | Declaração formal de entrega e instalação |
| 4 | **Termo de Entrega por Ambiente** | Um termo separado por cômodo |
| 5 | **Certificado de Garantia** | 2 páginas com cláusulas e instruções de manutenção |
| 6 | **Lista de Materiais** | Chapas, ferragens e serviços por ambiente |
| 7 | **Contrato** | Contrato completo com cláusulas jurídicas (múltiplos modelos) |

### 3.2 Como Funciona o Dropdown

No rodapé da tela de Orçamento, dois selects lado a lado — exatamente como no Sismarcenaria:

```
[📄 Visualizar Documento ▼]    [📝 Visualizar Contrato ▼]    [Salvar] [Faturar] [Perder]
```

Ao selecionar uma opção, abre nova aba com o PDF gerado automaticamente.

### 3.3 Estrutura das Rotas de Documentos

```
GET /api/documentos/:orc_id/orcamento
GET /api/documentos/:orc_id/ordem-servico
GET /api/documentos/:orc_id/termo-entrega
GET /api/documentos/:orc_id/termo-por-ambiente
GET /api/documentos/:orc_id/certificado
GET /api/documentos/:orc_id/lista-materiais
GET /api/documentos/:orc_id/contrato?modelo_id=1
```

### 3.4 Instalação Necessária

```bash
npm install puppeteer          # Gera PDF perfeito a partir de HTML
npm install multer             # Upload de imagens (logos)
npm install @tiptap/react      # Editor rico de texto
npm install @tiptap/starter-kit
npm install @tiptap/extension-color
npm install @tiptap/extension-text-align
```

---

## 4. CONFIGURAÇÕES DA EMPRESA E LOGOS

> Nova seção dentro de Configurações, igual ao `/erp/emitente` do Sismarcenaria.

### 4.1 O Que Configurar

**Card Esquerdo — Dados para o Cabeçalho dos Documentos:**
- Logo pequena (aparece no topo esquerdo de cada documento)
- Razão Social / Nome Fantasia
- CNPJ
- Endereço completo
- E-mail de contato
- Telefone

**Card Direito — Marca d'Água:**
- Logo em PNG (aparece ao fundo de todas as páginas)
- Controle de opacidade (slider 0% a 30%, padrão 8%)

### 4.2 Schema da Tabela

```sql
CREATE TABLE empresa_config (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  nome                TEXT,
  cnpj                TEXT,
  endereco            TEXT,
  numero              TEXT,
  bairro              TEXT,
  cidade              TEXT,
  estado              TEXT,
  cep                 TEXT,
  email               TEXT,
  telefone            TEXT,
  logo_header_path    TEXT,    -- caminho do arquivo de logo do cabeçalho
  logo_watermark_path TEXT,    -- caminho da marca d'água (PNG)
  watermark_opacidade REAL DEFAULT 0.08,
  consideracoes_orcamento TEXT, -- texto padrão das "Considerações Finais"
  atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 Rotas do Backend

```
GET  /api/empresa-config           → buscar configurações
PUT  /api/empresa-config           → salvar dados da empresa
POST /api/empresa-config/logo-header      → upload logo cabeçalho
POST /api/empresa-config/logo-watermark   → upload marca d'água
```

### 4.4 Armazenamento de Arquivos

```
server/
  uploads/
    logos/
      header.png       ← logo do cabeçalho
      watermark.png    ← marca d'água
```

---

## 5. EDITOR DE MODELOS DE DOCUMENTOS

> Permite personalizar o texto de cada documento. O contrato é o mais completo.

### 5.1 Tela "Modelo de Documentos"

Lista todos os tipos de documento com botão de editar. O **Contrato** permite múltiplos modelos (cada um com nome próprio) e tem botão "+ Cadastrar".

```
Configurações > Modelo de Documentos

┌─ Contrato ──────────────────────────────── [+ Cadastrar] ─┐
│  Contrato Padrão                                    ✏️  🗑️ │
│  Contrato Simplificado                              ✏️  🗑️ │
└──────────────────────────────────────────────────────────┘

┌─ Orçamento ───────────────────────────────────────────────┐
│  Orçamento Padrão                                   ✏️     │
└──────────────────────────────────────────────────────────┘

┌─ Ordem de Serviço ────────────────────────────────────────┐
│  Ordem de Serviço                                   ✏️     │
└──────────────────────────────────────────────────────────┘
  ... (Termo de Entrega, Certificado de Garantia)
```

### 5.2 Schema da Tabela

```sql
CREATE TABLE modelos_documento (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                     TEXT NOT NULL,
  -- contrato | orcamento | ordem_servico | termo_entrega
  -- termo_por_ambiente | certificado | lista_materiais
  nome                     TEXT NOT NULL,
  corpo_html               TEXT,      -- HTML editado pelo usuário
  complemento_contratante  TEXT,      -- texto após dados do cliente
  complemento_contratada   TEXT,      -- texto após dados da empresa
  exibir_valores_ambientes INTEGER DEFAULT 1,
  exibir_anexos            INTEGER DEFAULT 1,
  exibir_assinatura_testemunhas INTEGER DEFAULT 0,
  ativo                    INTEGER DEFAULT 1,
  criado_em                DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.3 Editor de Contrato — Funcionalidades

**Campos da tela:**
1. **Nome do modelo** — input de texto (ex: "Contrato Padrão", "Contrato Simplificado")
2. **Painel de Tags disponíveis** — exibido em dois cards lado a lado (Tags do orçamento | Tags de endereço)
3. **Dica:** `Pressione # no editor para ver as tags disponíveis`
4. **Complemento do Contratante** — textarea (texto concatenado após dados do cliente)
5. **Complemento da Contratada** — textarea (texto concatenado após dados da empresa)
6. **Editor WYSIWYG** — negrito, itálico, sublinhado, fonte, tamanho, cor, listas, alinhamento, tabelas, HTML cru
7. **Opções finais:**
   - Exibir valores dos ambientes no contrato? SIM / NÃO
   - Exibir anexos no contrato? SIM / NÃO
   - Exibir assinatura de testemunhas? SIM / NÃO

### 5.4 Sistema de Tags Dinâmicas

Ao gerar o PDF, todas as `[tags]` são substituídas pelos dados reais:

**Tags do Orçamento:**
```
[nome_empresa]         → Razão social da empresa
[cnpj]                 → CNPJ da empresa
[endereco_empresa]     → Endereço da empresa
[cidade]               → Cidade da empresa
[estado]               → Estado da empresa
[responsavel]          → Nome do vendedor/responsável
[arquiteto]            → Nome do arquiteto/designer
[numero_orcamento]     → Ex: 2026/13
[data_inicial]         → Data de início do projeto
[data_entrega]         → Data de entrega prevista
[dias_montagem]        → Dias úteis para montagem
[dias_entrega]         → Dias úteis para entrega
[garantia]             → Tempo de garantia (ex: 1 ano)
[valor_total]          → Valor total formatado em R$
[valor_entrada]        → Valor da entrada
[forma_pagamento]      → Forma de pagamento
[desconto]             → Desconto aplicado
[parcelas]             → Número de parcelas
[data_hoje]            → Data atual por extenso
[cidade_hoje]          → Cidade atual (da empresa)
```

**Tags do Cliente:**
```
[nome_cliente]         → Nome completo do cliente
[cpf_cliente]          → CPF ou CNPJ do cliente
[telefone_cliente]     → Telefone do cliente
[email_cliente]        → E-mail do cliente
[rua_cliente]          → Rua do endereço
[numero_cliente]       → Número do endereço
[bairro_cliente]       → Bairro
[cidade_cliente]       → Cidade do cliente
[estado_cliente]       → Estado do cliente
[cep_cliente]          → CEP do cliente
```

### 5.5 Função de Resolução de Tags

```javascript
// server/utils/tags.js
export function resolverTags(html, { orc, cliente, empresa }) {
  const tags = {
    '[nome_empresa]':     empresa.nome        || '',
    '[cnpj]':             empresa.cnpj        || '',
    '[responsavel]':      orc.vendedor_nome   || '',
    '[numero_orcamento]': `${new Date(orc.criado_em).getFullYear()}/${orc.id}`,
    '[data_entrega]':     formatarData(orc.data_entrega),
    '[garantia]':         orc.garantia        || '1 ano',
    '[valor_total]':      formatarMoeda(orc.valor_venda),
    '[nome_cliente]':     cliente?.nome        || '',
    '[cpf_cliente]':      cliente?.cpf         || '',
    '[data_hoje]':        formatarDataExtenso(new Date()),
    // ... todas as outras tags
  }
  let resultado = html
  Object.entries(tags).forEach(([tag, valor]) => {
    resultado = resultado.replaceAll(tag, valor)
  })
  return resultado
}
```

---

## 6. SISTEMA DE GERAÇÃO DE PDF

### 6.1 Tecnologia Recomendada: Puppeteer

```javascript
// server/utils/gerarPdf.js
import puppeteer from 'puppeteer'

export async function gerarPdf(htmlCompleto) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page    = await browser.newPage()

  await page.setContent(htmlCompleto, { waitUntil: 'networkidle0' })

  const pdf = await page.pdf({
    format:            'A4',
    printBackground:   true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
  })

  await browser.close()
  return pdf
}
```

### 6.2 Template Base de Cada Documento

```html
<!-- Estrutura padrão de todos os PDFs -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #333; }

    /* Cabeçalho com logo da empresa */
    .header { display: flex; justify-content: space-between;
              border-bottom: 2px solid #333; padding-bottom: 12px; }
    .header img { height: 50px; }
    .header .empresa { text-align: right; font-size: 10px; }

    /* Marca d'água ao fundo */
    .watermark {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      opacity: 0.08;   /* configurável pelo usuário */
      z-index: -1;
    }
    .watermark img { width: 400px; }

    /* Tabelas */
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; padding: 6px 10px; font-size: 10px;
         text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; }

    /* Rodapé com numeração */
    .footer { position: fixed; bottom: 10mm; right: 15mm;
              font-size: 9px; color: #999; }
  </style>
</head>
<body>

  <!-- Marca d'água -->
  <div class="watermark">
    <img src="[LOGO_WATERMARK_BASE64]" />
  </div>

  <!-- Cabeçalho -->
  <div class="header">
    <img src="[LOGO_HEADER_BASE64]" />
    <div class="empresa">
      <strong>[NOME_EMPRESA]</strong><br>
      CNPJ: [CNPJ]<br>
      [ENDERECO]<br>
      [EMAIL] | [TELEFONE]
    </div>
  </div>

  <!-- CONTEÚDO DO DOCUMENTO AQUI -->
  [CORPO]

  <!-- Rodapé -->
  <div class="footer">Página <span class="pageNumber"></span></div>

</body>
</html>
```

### 6.3 Estrutura do Orçamento em PDF

```
┌─────────────────────────────────────────────────────┐
│  [LOGO]              STUDIO ORNATO MOVEIS LTDA       │
│                      CNPJ: 50.617.842/0001-65        │
│                      contato@studioornato.com.br     │
├─────────────────────────────────────────────────────┤
│  ORÇAMENTO Nº 2026/13                                │
│                                                      │
│  Cliente: TEREZA          Responsável: VICTOR        │
│  Data: 29/01/2026         Entrega: 30/03/2026        │
├─────────────────────────────────────────────────────┤
│  ▌ COZINHA                                           │
│  ┌─────────────────────────────────── Qtd │ Subtotal │
│  │ Armário Alto 200x60x55cm           1   │ R$2.570  │
│  │   Descrição detalhada do item...        │          │
│  │ Aéreo Duplo 80x65x35cm             3   │ R$4.200  │
│  └─────────────────────────── Total ambiente: R$6.770│
│                                                      │
│  ▌ ÁREA DE SERVIÇO                                   │
│  ...                                                 │
├─────────────────────────────────────────────────────┤
│  VALOR TOTAL DOS AMBIENTES:              R$ 7.699,28 │
│  VALOR TOTAL DO ORÇAMENTO:               R$ 7.699,28 │
├─────────────────────────────────────────────────────┤
│  CONSIDERAÇÕES FINAIS                                │
│  1 ano de garantia para produtos fornecidos.         │
│  Toda ferragem usada é de primeira linha.            │
│  Prazo de entrega: 45 dias após assinatura.          │
│  Validade do orçamento: 7 dias úteis.                │
├─────────────────────────────────────────────────────┤
│  Paço do Lumiar/MA, segunda, 23 de fevereiro de 2026 │
│                                                      │
│          ________________________________            │
│          STUDIO ORNATO MOVEIS LTDA                   │
│          CNPJ: 50.617.842/0001-65                    │
└─────────────────────────────────────────────────────┘
```

---

## 7. MELHORIAS NO CADASTRO DE CLIENTES

> O sistema atual tem apenas: nome, telefone, email, cidade e arquiteto.
> O sistema antigo e o Sismarcenaria têm muito mais.

### 7.1 Campos a Adicionar

```sql
ALTER TABLE clientes ADD COLUMN cpf       TEXT;
ALTER TABLE clientes ADD COLUMN rg        TEXT;
ALTER TABLE clientes ADD COLUMN endereco  TEXT;
ALTER TABLE clientes ADD COLUMN numero    TEXT;
ALTER TABLE clientes ADD COLUMN complemento TEXT;
ALTER TABLE clientes ADD COLUMN bairro    TEXT;
ALTER TABLE clientes ADD COLUMN cep       TEXT;
ALTER TABLE clientes ADD COLUMN estado    TEXT;
ALTER TABLE clientes ADD COLUMN data_nascimento DATE;
ALTER TABLE clientes ADD COLUMN estado_civil TEXT;
ALTER TABLE clientes ADD COLUMN profissao TEXT;
ALTER TABLE clientes ADD COLUMN obs       TEXT;
```

### 7.2 Busca Automática de CEP (ViaCEP)

```javascript
// No formulário de cliente, ao sair do campo CEP:
async function buscarCep(cep) {
  const cepLimpo = cep.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return

  const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
  const data = await resp.json()

  if (!data.erro) {
    setForm(f => ({
      ...f,
      endereco:    data.logradouro,
      bairro:      data.bairro,
      cidade:      data.localidade,
      estado:      data.uf,
      complemento: data.complemento,
    }))
  }
}
```

### 7.3 Proteção ao Deletar Cliente com Orçamento

```javascript
// No backend, antes de deletar cliente:
const orcamentos = db.prepare(
  'SELECT COUNT(*) as total FROM orcamentos WHERE cliente_id = ?'
).get(id)

if (orcamentos.total > 0) {
  return res.status(400).json({
    erro: `Este cliente possui ${orcamentos.total} orçamento(s).
           Não é possível excluir.`
  })
}
```

---

## 8. MELHORIAS NOS ORÇAMENTOS

### 8.1 Campos a Adicionar na Tabela

```sql
ALTER TABLE orcamentos ADD COLUMN data_inicial    DATE;
ALTER TABLE orcamentos ADD COLUMN data_entrega    DATE;
ALTER TABLE orcamentos ADD COLUMN dias_montagem   INTEGER DEFAULT 7;
ALTER TABLE orcamentos ADD COLUMN dias_entrega    INTEGER DEFAULT 45;
ALTER TABLE orcamentos ADD COLUMN garantia        TEXT DEFAULT '1 ano';
ALTER TABLE orcamentos ADD COLUMN forma_pagamento TEXT;
ALTER TABLE orcamentos ADD COLUMN parcelas        INTEGER DEFAULT 1;
ALTER TABLE orcamentos ADD COLUMN valor_entrada   REAL DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN desconto        REAL DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN vendedor_nome   TEXT;
ALTER TABLE orcamentos ADD COLUMN arquiteto_nome  TEXT;
```

### 8.2 Abas no Orçamento (igual ao Sismarcenaria)

A tela de orçamento deve ter abas:

| Aba | Conteúdo |
|---|---|
| **Dados do Orçamento** | Cliente, Vendedor, Arquiteto, Status, Datas, Garantia, Ambientes |
| **Precificação** | Tabela: Valor Insumos / Valor Produção / Valor Total por ambiente |
| **Condições de Pagamento** | Forma, parcelas, entrada %, desconto |
| **Anotações** | Log interno com data e autor |
| **Comissões** | Responsável, percentual, sobre qual valor |
| **Anexos** | Upload de arquivos (PDF, PNG, JPG) até 16MB |

### 8.3 Filtros na Lista de Orçamentos

```
[Buscar por cliente ou projeto...] [Status ▼] [Período ▼] [Vendedor ▼] [Buscar]
```

### 8.4 Duplicar Orçamento

```javascript
// POST /api/orcamentos/:id/duplicar
// Copia todos os dados do orçamento e cria um novo com status 'rascunho'
```

### 8.5 Status Explícitos (além do Kanban)

```
Pendente → Faturado → Perdido
```
Com motivo de perda obrigatório ao marcar como "Perdido":
- Preço (achou caro)
- Fechou com outra empresa
- Não teve interesse
- Não retornou o contato
- Problemas de comunicação

---

## 9. MELHORIAS NA BIBLIOTECA E CATÁLOGO

### 9.1 Campos a Adicionar nos Módulos

```sql
ALTER TABLE modulos_custom ADD COLUMN marca           TEXT;
ALTER TABLE modulos_custom ADD COLUMN codigo_fornecedor TEXT;
ALTER TABLE modulos_custom ADD COLUMN categoria       TEXT;
ALTER TABLE modulos_custom ADD COLUMN peso            REAL;
ALTER TABLE modulos_custom ADD COLUMN cor             TEXT;
ALTER TABLE modulos_custom ADD COLUMN acabamento      TEXT;
ALTER TABLE modulos_custom ADD COLUMN coef_dificuldade REAL DEFAULT 1.0;
ALTER TABLE modulos_custom ADD COLUMN ativo           INTEGER DEFAULT 1;
```

### 9.2 Funcionalidades a Implementar

- **Exportar/Importar** biblioteca em JSON ou CSV
- **Soft delete** — desativar item sem apagar (campo `ativo`)
- **Paginação** — não carregar todos os itens de uma vez
- **Filtros** — por tipo, categoria, marca
- **Código de fornecedor** para rastreabilidade
- **Cálculo de preço por m²** como endpoint dedicado

---

## 10. CRM COM HISTÓRICO DE INTERAÇÕES

> Além do Kanban, registrar cada contato com o cliente.

### 10.1 Schema da Tabela

```sql
CREATE TABLE interacoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER REFERENCES clientes(id),
  orc_id      INTEGER REFERENCES orcamentos(id),
  user_id     INTEGER REFERENCES users(id),
  tipo        TEXT,
  -- ligacao | visita | email | whatsapp | reuniao | nota
  titulo      TEXT,
  descricao   TEXT,
  resultado   TEXT,  -- positivo | neutro | negativo
  followup    DATE,  -- data do próximo contato
  criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 10.2 Funcionalidades

- Timeline de interações na ficha do cliente
- Agenda de follow-ups com alertas no dashboard
- Filtro de clientes com follow-up atrasado
- Taxa de conversão por estágio do funil
- Origem do lead (indicação, Instagram, Google, Fachada, etc.)
- Motivo de perda com análise de tendências

---

## 11. ORDEM DE PRODUÇÃO E LOTES DE CORTE

> Do orçamento aprovado ao chão de fábrica.

### 11.1 Fluxo

```
Orçamento APROVADO
       ↓
Criar Ordem de Produção (OP)
       ↓
Sistema gera automaticamente 1 Lote de Corte por Ambiente
       ↓
Responsável atualiza status de cada lote:
  Pendente → Cortando → Cortado → Montando → Pronto
       ↓
Quando Pronto: notifica cliente para aprovação (Portal do Cliente)
       ↓
Cliente APROVA → Lote marcado como "Aprovado pelo Cliente"
       ↓
Todos os lotes aprovados → OP "Aguardando Entrega"
       ↓
Entregue → Fechar OP
```

### 11.2 Schema das Tabelas

```sql
-- Ordens de Produção
CREATE TABLE ordens_producao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  orc_id        INTEGER NOT NULL REFERENCES orcamentos(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  numero        TEXT NOT NULL,   -- ex: "OP-2026-001"
  status        TEXT DEFAULT 'aguardando',
  -- aguardando | em_corte | em_montagem | em_pintura
  -- aguardando_entrega | entregue
  prazo         DATE,
  obs           TEXT,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lotes de Corte (1 por ambiente)
CREATE TABLE lotes_corte (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id            INTEGER NOT NULL REFERENCES ordens_producao(id),
  ambiente         TEXT NOT NULL,
  status           TEXT DEFAULT 'pendente',
  -- pendente | cortando | cortado | montando | pronto | aprovado_cliente
  pecas_json       TEXT,   -- JSON com lista de peças e dimensões
  foto_urls        TEXT DEFAULT '[]',  -- fotos do corte
  responsavel      TEXT,
  obs              TEXT,
  inicio_previsto  DATE,
  inicio_real      DATETIME,
  fim_real         DATETIME,
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Timeline de eventos da OP
CREATE TABLE op_timeline (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id     INTEGER REFERENCES ordens_producao(id),
  lote_id   INTEGER REFERENCES lotes_corte(id),
  tipo      TEXT,  -- status_change | foto | comentario | aprovacao_cliente
  texto     TEXT,
  autor     TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Aprovações do cliente por lote
CREATE TABLE aprovacoes_cliente (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id       INTEGER NOT NULL REFERENCES lotes_corte(id),
  token         TEXT UNIQUE NOT NULL,
  status        TEXT DEFAULT 'pendente',  -- pendente | aprovado | reprovado
  comentario    TEXT,
  ip_cliente    TEXT,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  respondido_em DATETIME
);
```

### 11.3 Status da Ordem de Produção

| Status | Emoji | Descrição |
|---|---|---|
| aguardando | ⏳ | OP criada, aguardando início |
| em_corte | ✂️ | Chapas sendo cortadas |
| em_montagem | 🔨 | Módulos sendo montados |
| em_pintura | 🎨 | Pintura e acabamento |
| aguardando_entrega | 📦 | Pronto para entrega |
| entregue | ✅ | Entregue ao cliente |

---

## 12. PORTAL DO CLIENTE

> O cliente acompanha a produção em tempo real pelo celular, sem precisar instalar nada.

### 12.1 Como Funciona

1. Quando a OP é criada, o sistema gera um **link único** por orçamento
2. O vendedor envia o link por WhatsApp/Email
3. O cliente abre no celular — sem login, sem app
4. O cliente vê o progresso de cada ambiente da casa
5. Quando um lote fica "Pronto", o cliente recebe notificação e pode **aprovar ou reprovar**
6. O cliente pode enviar mensagens/comentários diretamente

### 12.2 Schema da Tabela

```sql
CREATE TABLE portal_tokens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  orc_id         INTEGER NOT NULL REFERENCES orcamentos(id),
  token          TEXT UNIQUE NOT NULL,  -- 64 chars hex aleatório
  ativo          INTEGER DEFAULT 1,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  ultimo_acesso  DATETIME
);
```

### 12.3 Rota Pública (sem autenticação)

```
GET  /api/portal/:token           → dados completos do projeto
POST /api/portal/:token/aprovar/:lote_id  → cliente aprova/reprova lote
POST /api/portal/:token/comentario         → cliente envia mensagem
```

### 12.4 O Que o Cliente Vê

```
┌─────────────────────────────────────────────┐
│  🪵 ORNATO MARCENARIA                        │
│  Olá, TEREZA!                                │
│  Projeto: COZINHA COMPLETA                   │
│  OP-2026-001 • Prazo: 30/03/2026             │
├─────────────────────────────────────────────┤
│  STATUS DO PROJETO                           │
│  [⏳] [✂️] [🔨] [🎨] [📦] [✅]              │
│       EM CORTE                               │
├─────────────────────────────────────────────┤
│  📦 COZINHA                    ✂️ Em corte   │
│  📸 Fotos: [img1] [img2]                     │
│  📋 Ver lista de peças (12)                  │
├─────────────────────────────────────────────┤
│  📦 ÁREA DE SERVIÇO            ⏳ Aguardando │
├─────────────────────────────────────────────┤
│  📦 QUARTO DO CASAL            ✅ Aprovado   │
│  Você aprovou em 15/02/2026                  │
├─────────────────────────────────────────────┤
│  📅 HISTÓRICO                                │
│  🏭 23/02 — OP criada                        │
│  ✂️ 24/02 — Cozinha em corte                 │
│  📸 25/02 — Foto adicionada ao lote          │
├─────────────────────────────────────────────┤
│  💬 ENVIAR MENSAGEM                          │
│  [Dúvidas ou solicitações...      ]          │
│  [          Enviar          ]                │
└─────────────────────────────────────────────┘
```

### 12.5 Diferencial Competitivo

> **Nenhum marceneiro da região entrega isso ao cliente.**
> O cliente não precisa ficar ligando para saber se a cozinha está pronta.
> Ele acompanha pelo celular como se fosse um delivery de comida.
> Isso gera confiança, reduz retrabalho por comunicação falha e aumenta indicações.

---

## 13. MELHORIAS DE UX/UI

### 13.1 Correções Imediatas

| Item | Arquivo | Correção |
|---|---|---|
| Ícone busca errado | Cli.jsx | Trocar `Ic.Box` por `Ic.Search` |
| CSS inválido Kanban | Kb.jsx | Remover o `0` de `text-[var(--text-primary)]0` |
| Dois azuis conflitantes | tailwind.config.js + index.css | Unificar `#1379F0` |
| Letra errada na logo | Login.jsx + App.jsx | Trocar `S` por `O` |
| `confirm()` nativo | Cli.jsx e outros | Criar `ModalConfirmacao` |
| Subtítulo mentiroso Kanban | Kb.jsx | Trocar texto ou implementar DnD |

### 13.2 Melhorias de Experiência

- **Skeleton loading** em todas as páginas durante carregamento de dados
- **Tooltips** nos ícones quando a sidebar está recolhida
- **Botões de ação** sempre visíveis (não só no hover)
- **Soft delete** com botão "Desfazer" por 5 segundos
- **Paginação** nas listagens (clientes e orçamentos)
- **Filtros e busca** na tela de orçamentos
- **Dashboard com insights reais:**
  - Follow-ups pendentes para hoje
  - Taxa de conversão do mês
  - Ticket médio
  - Comparativo com mês anterior
- **KPI cards com tendência** (seta ↑↓ e % de variação)

### 13.3 Drag and Drop no Kanban

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 13.4 Atalhos de Teclado

| Atalho | Ação |
|---|---|
| `N` | Novo orçamento |
| `C` | Novo cliente |
| `Esc` | Fechar modal |
| `Ctrl+S` | Salvar orçamento |
| `Ctrl+P` | Imprimir / gerar PDF |

---

## 14. MELHORIAS TÉCNICAS E DE SEGURANÇA

### 14.1 Variáveis de Ambiente (URGENTE)

```bash
# Criar arquivo .env na raiz do projeto
JWT_SECRET=sua_chave_secreta_forte_aqui_minimo_32_chars
PORT=3001
NODE_ENV=development
UPLOAD_PATH=./server/uploads
FRONTEND_URL=http://localhost:5173
```

```javascript
// server/index.js — substituir
import dotenv from 'dotenv'
dotenv.config()

// Trocar:
// jwt.sign(payload, 'minha-chave-secreta')
// Por:
jwt.sign(payload, process.env.JWT_SECRET)
```

### 14.2 Migrar SQLite para PostgreSQL

```bash
npm install pg
npm install knex  # query builder com migrations
```

**Por que migrar:**
- SQLite não suporta múltiplos usuários simultâneos com escrita
- PostgreSQL é necessário para deploy em produção na nuvem
- Suporte a tipos de dados mais ricos (JSON nativo, arrays, etc.)

### 14.3 Sistema de Migrations

```bash
# Criar estrutura de migrations com Knex
npx knex init
npx knex migrate:make criar_tabelas_iniciais
npx knex migrate:latest
```

### 14.4 Refresh Token

```javascript
// Tokens expiram em 24h. Adicionar refresh token:
// - Access Token: expira em 1h
// - Refresh Token: expira em 30 dias, armazenado em httpOnly cookie
```

### 14.5 Upload de Arquivos

```bash
npm install multer       # upload de arquivos
npm install sharp        # otimização de imagens
```

```javascript
// Limitar tamanho e tipo dos uploads:
const upload = multer({
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
  fileFilter: (req, file, cb) => {
    const tipos = ['image/jpeg','image/png','image/webp','application/pdf']
    cb(null, tipos.includes(file.mimetype))
  }
})
```

### 14.6 Deploy em Nuvem

**Opções recomendadas para uma marcenaria:**

| Plataforma | Custo | Facilidade | Indicado para |
|---|---|---|---|
| Railway.app | ~R$50/mês | ⭐⭐⭐⭐⭐ | Produção pequena/média |
| Render.com | Grátis/R$35 | ⭐⭐⭐⭐ | Teste e produção |
| VPS DigitalOcean | ~R$50/mês | ⭐⭐⭐ | Controle total |

---

## 15. ROADMAP POR FASES

### 🔴 FASE 0 — Correções Urgentes (1 semana)
> Não lança nada novo. Só corrige o que está errado.

- [ ] Corrigir 6 bugs identificados na auditoria
- [ ] Mover JWT_SECRET para variável de ambiente (.env)
- [ ] Unificar as duas paletas de cores
- [ ] Criar componente ModalConfirmacao

---

### 🟡 FASE 1 — Documentos (3-4 semanas)
> Primeira entrega com valor real para o cliente da marcenaria.

- [ ] Schema: `empresa_config` + `modelos_documento`
- [ ] Tela de configuração da empresa (logo header + watermark)
- [ ] Upload de logos com multer
- [ ] Editor rico de contrato com TipTap
- [ ] Sistema de tags dinâmicas
- [ ] Geração de PDF com Puppeteer
- [ ] Gerar: Orçamento, Ordem de Serviço, Contrato
- [ ] Dropdown "Visualizar Documentos" no orçamento
- [ ] Gerar: Termo de Entrega, Certificado de Garantia, Lista de Materiais

---

### 🟡 FASE 2 — Orçamento Completo (3-4 semanas)
> Recuperar funcionalidades que existiam no sistema antigo.

- [ ] Campos adicionais no cadastro de cliente (CPF, endereço, CEP automático)
- [ ] Abas no orçamento: Anotações, Comissões, Anexos, Condições de Pagamento
- [ ] Taxas configuráveis por orçamento (não só global)
- [ ] Filtros e busca na lista de orçamentos
- [ ] Duplicar orçamento
- [ ] Status "Faturado" / "Perdido" com motivo
- [ ] Soft delete com "Desfazer"

---

### 🟢 FASE 3 — CRM Completo (3-4 semanas)
> Relacionamento com cliente muito mais rico.

- [ ] Schema: `interacoes`
- [ ] Timeline de interações na ficha do cliente
- [ ] Agenda de follow-ups no dashboard
- [ ] Motivo de perda e análise de conversão
- [ ] Origem do lead
- [ ] Drag-and-drop real no Kanban (@dnd-kit)

---

### 🟢 FASE 4 — Produção e Portal do Cliente (4-5 semanas)
> O grande diferencial competitivo.

- [ ] Schema: `ordens_producao`, `lotes_corte`, `op_timeline`, `aprovacoes_cliente`, `portal_tokens`
- [ ] Tela de Ordens de Produção
- [ ] Geração automática de lotes por ambiente
- [ ] Upload de fotos dos lotes
- [ ] Timeline da OP
- [ ] Geração do link único do portal
- [ ] Página pública do Portal do Cliente (mobile-first)
- [ ] Sistema de aprovação/reprovação por lote
- [ ] Mensagens do cliente na timeline

---

### 🔵 FASE 5 — Escala e Integrações (2-3 meses)
> Para quando o sistema estiver maduro.

- [ ] Migrar SQLite → PostgreSQL
- [ ] Deploy em Railway/Render
- [ ] Refresh Token
- [ ] Relatórios gerenciais (por vendedor, período, produto)
- [ ] Exportar listas para CSV/Excel
- [ ] Controle básico de estoque
- [ ] Integração WhatsApp (link direto)
- [ ] Notificações por e-mail
- [ ] PWA (funciona offline no celular)

---

## 16. SCHEMA COMPLETO DO BANCO DE DADOS

> Estado final do banco após todas as fases implementadas.

```sql
-- USUÁRIOS
users (id, nome, email, senha_hash, role, ativo, criado_em)

-- EMPRESA
empresa_config (id, nome, cnpj, endereco, numero, bairro, cidade, estado,
                cep, email, telefone, logo_header_path, logo_watermark_path,
                watermark_opacidade, consideracoes_orcamento, atualizado_em)

-- CLIENTES
clientes (id, user_id, nome, tel, email, cpf, rg, endereco, numero,
          complemento, bairro, cep, cidade, estado, arq,
          data_nascimento, estado_civil, profissao, obs, criado_em)

-- ORÇAMENTOS
orcamentos (id, user_id, cliente_id, cliente_nome, ambiente, mods_json,
            obs, custo_material, valor_venda, status, kb_col,
            data_inicial, data_entrega, dias_montagem, dias_entrega,
            garantia, forma_pagamento, parcelas, valor_entrada, desconto,
            vendedor_nome, arquiteto_nome, criado_em, atualizado_em)

-- CONFIGURAÇÃO DE TAXAS
config_taxas (id, imp, com, mont, lucro, frete, mdo, inst)

-- MÓDULOS PERSONALIZADOS
modulos_custom (id, user_id, tipo_item, json_data, marca,
                codigo_fornecedor, categoria, ativo, criado_em)

-- MODELOS DE DOCUMENTOS
modelos_documento (id, tipo, nome, corpo_html, complemento_contratante,
                   complemento_contratada, exibir_valores_ambientes,
                   exibir_anexos, exibir_assinatura_testemunhas,
                   ativo, criado_em)

-- INTERAÇÕES CRM
interacoes (id, cliente_id, orc_id, user_id, tipo, titulo,
            descricao, resultado, followup, criado_em)

-- ORDENS DE PRODUÇÃO
ordens_producao (id, orc_id, user_id, numero, status, prazo,
                 obs, criado_em, atualizado_em)

-- LOTES DE CORTE
lotes_corte (id, op_id, ambiente, status, pecas_json, foto_urls,
             responsavel, obs, inicio_previsto, inicio_real,
             fim_real, criado_em)

-- TIMELINE DA OP
op_timeline (id, op_id, lote_id, tipo, texto, autor, criado_em)

-- APROVAÇÕES DO CLIENTE
aprovacoes_cliente (id, lote_id, token, status, comentario,
                    ip_cliente, criado_em, respondido_em)

-- PORTAL DO CLIENTE
portal_tokens (id, orc_id, token, ativo, criado_em, ultimo_acesso)

-- ANEXOS DOS ORÇAMENTOS
anexos_orcamento (id, orc_id, nome, path, tipo_arquivo,
                  tamanho_bytes, criado_em)

-- ANOTAÇÕES DOS ORÇAMENTOS
anotacoes_orcamento (id, orc_id, user_id, texto, criado_em)

-- COMISSÕES DOS ORÇAMENTOS
comissoes_orcamento (id, orc_id, tipo_responsavel, responsavel_nome,
                     percentual, sobre_valor, criado_em)
```

---

---

## 17. ANÁLISE COMPARATIVA — VIGGA vs ORNATO

> **Sistema analisado:** studio.vigga.com.br (23/02/2026)
> Análise feita por navegação real com captura de dados, screenshots e JavaScript extraction.

---

### 17.1 — CATÁLOGO DE PRODUTOS (57 tipos no Vigga)

O Vigga possui um catálogo de produtos muito mais rico que o Ornato atual:

**Produtos Vigga (completo):**
ADEGA, APARADOR COM BASE, APARADOR SUSPENSO, ARMARIO DESPENSA, ARMARIO INFERIOR, ARMARIO INFERIOR ILHA, ARMARIO PISO TETO, ARMARIO PISO TETO S/ FUNDO, ARMARIO SUPERIOR, ARMARIO SUPERIOR ILHA, BALCÃO RECEPÇÃO, BANCADA HOME OFFICE, BANCADA PARA ILHA, BANCO ALEMÃO, BASE MESA, BATENTE, BUFFET, CABECEIRA LISA, CABECEIRA RIPADA, CABINE PARA REFRIGERADOR, CAMA DE CASAL, CAMA DE SOLTEIRO, CAMA DE SOLTEIRO AUXILIAR, CRISTALEIRA, ESPELHO PERSONALIZADO, ESTANTE, GABINETE PARA AR CONDICIONADO, GAVETEIRO, HOME THEATER, MESA, MESA DE CABECEIRA, MESA DE REUNIÃO, MUXARABI, NICHO SOLTO, PAINEL FRISADO, PAINEL LISO, PAINEL PERSONALIZADO, PAINEL RIPADO, PAINEL RIPADO 10X10, PAINEL RIPADO 5X5, PENTEADEIRA, PERGOLADO, PORTA PADRÃO, PORTA PERSONALIZADA, PORTA RIPADA, PORTICO, PRATELEIRA, REVESTIMENTO TETO FRISADO, REVESTIMENTO TETO LISO, REVESTIMENTO TETO RIPADO, RODAPÉ, SAPATEIRA, TAMBURATO, TAMBURATO PERSONALIZADO, TAMPO/BANCADA, TORRE QUENTE

**O que temos no Ornato:** catálogo parametrizado via `engine.js` com os tipos: INFERIOR, SUPERIOR, TORRE, PAINEL, PRATELEIRA, etc.
**Gap:** O Ornato não tem interface de seleção visual de tipo de produto — trabalha com módulos configuráveis. A abordagem Vigga (dropdown de produtos fixos) é mais acessível para o vendedor.

**Recomendação para Ornato:** Manter o motor paramétrico (vantagem competitiva), mas adicionar um campo "Tipo de Produto" visível no orçamento para relatórios e rastreamento.

---

### 17.2 — ACABAMENTOS E ESPESSURAS POR PRODUTO

**Vigga implementa por produto:**
- **ACAB. EXT** (acabamento externo) — 17 opções:
  COLORIDO GG, LACA DUPLA, LACA FACE, MDF ACETINATA, MDF ALTO BRILHO, MDF AURA DURATEX, MDF AZUL PETROLEO, MDF BRANCO TX, MDF CARVALHO HANNOVER, MDF FREIJO DUAL SYNCRO, MDF LINEN GRIGIO, MDF MADERIADO, MDF PER. URBANA, MDF PERSONALIZADO, MDF ULTRA, MDF ZULATO
- **MM EXT** (espessura externa) — 6 / 15 / 18 / 25 mm
- **ACAB. INT** (acabamento interno) — mesma lista
- **MM INT** (espessura interna) — mesma lista

**Para subitens, acabamentos expandidos incluem:**
ARGENTATO, BRANCO TX, CANELADO, CAPTONE, COSTURA, ESPELHO, ESPELHO GUARDIAN, ESPELHO PERSONALIZADO, ESTRUTURA DE METALON, ESTRUTURA DE REFORÇO, FUME, INCOLOR, JEANS, LEITOSO, LISO, MDF PERSONALIZADO, METALON, PORTA REFLECTA BRONZE, REFLECTA, SINTETICO, SUEDE, TUBO ARREDONDADO, VIDRO CANELADO + todos os MDFs

**Para subitens, espessuras expandidas:** 0 / 5 / 6 / 8 / 10 / 15 / 18 / 20 / 25 / 30 mm

**No Ornato atual:** `engine.js` usa `DB_CHAPAS` com dados de chapa por referência. A configuração de acabamento é feita na Biblioteca.
**Gap:** Ornato não expõe acabamento EXT/INT por produto na tela do orçamento.

---

### 17.3 — SUBITENS HIERÁRQUICOS (9 grupos, 47+ itens)

Vigga implementa hierarquia: **Proposta → Ambiente → Produto → Subitens**

**9 grupos de subitens:**
1. **GAVETAS:** GAV. CAVA, GAV. PERFIL, GAV. PERSONAL, GAV. PADRÃO, GAV. RIPADA
2. **PORTAS:** PORTA PERSONALIZADA, PORTA CAVA, PORTA PERFIL, PORTA RIPADA, PORTA PADRÃO, PORTA PROVENÇAL
3. **VIDROS:** PORTA DE VIDRO, PORTA CRISTALEIRA, PORTA BASCULANTE
4. **FERRAGENS:** CANALETA DE LED S/ABA, CANALETA DE LED C/ABA, CANALETA COM LED DE CANTO, RODIZIO PISO, RÉGUA DE TOMADA, TAMPA DE RÉGUA, KIT DE FECHADURA, VENEZIANA DE ALUMÍNIO, CABIDEIRO VESTO ROMETAL, FECHADURA INVISÍVEL, PISTÃO FGVTN, PISTÃO BLUM, KIT PISTÃO FGVTN
5. **ESPECÍFICOS:** TAMPO, PAINEL, ALMOFADA BASE, SEQUENCIATO, ARTICOLATO
6. **ESTOFADOS:** JEANS, SUEDE, COSTURA, CAPTONE
7. **FERROS:** BASE DE FERRO, TUBO ARRED PINTADO 1MT, METALON
8. **PORTAS DE VIDRO:** ESCAMOTEÁVEL RIVELATO ROMETAL, ESCAMOTIAVEL RIVELATTO FGV, COPLANAR FGV, PIVOTANTE
9. **ESQUADRIAS:** DOMINUS ROMETAL, AGILITY ROMETAL, LINEA ROMETAL, RO082 ROMETAL, EVO ROMETAL, FECHADURA PT GIRO ROLETE, FECHADURA PORTA CORRER ROLETE

**Numeração hierárquica:** 1 (ambiente) → 1.1 (produto) → 1.1.1 (subitem)

**No Ornato atual:** subitens existem no `engine.js` via `DB_FERRAGENS` mas sem interface visual de grupos.
**Implementação sugerida:**
```
Ambiente (Cozinha)
  └─ 1.1 ARMARIO SUPERIOR — 600×900×350mm — R$ 1.200
       ├─ 1.1.1 [GAVETAS] GAV. PERFIL — Hafele — qtd: 2
       ├─ 1.1.2 [FERRAGENS] PISTÃO BLUM — qtd: 4
       └─ 1.1.3 [PORTAS] PORTA PADRÃO — MDF BRANCO TX 18mm
```

---

### 17.4 — MARCAS DE FERRAGENS (diferencial competitivo)

Vigga permite especificar a **marca** das ferragens por proposta inteira:

**Corrediças (Drawer Slides):**
- OPENFIELD - INVISIVEL - AMORTECEDOR (padrão)
- HAFELE
- FGVTN
- OPENFIELD (outras linhas)

**Dobradiças (Hinges):**
- OPENFIELD - TITANIO - AMORTECEDOR (padrão)
- HAFELE
- FGVTN
- BLUM

O vendedor seleciona via painel de sliders (⚙️) ao lado do campo de ferragens. Isso é **vendido como diferencial** para o cliente premium.

**No Ornato:** não existe seleção de marca de ferragem.
**Implementação:** Adicionar campo `marca_correliças` e `marca_dobradicas` no orçamento, com impact no custo via tabela de preços por marca.

---

### 17.5 — PARÂMETROS FINANCEIROS DO ORÇAMENTO

**Modal "Parâmetros de Orçamento" (acesso protegido por senha 1234):**

```
CUSTOS                          MARGENS
─────────────────────────────   ────────────────────────────────
Custo de Materiais   R$ ---      Margem Operacional (%)  55,00
Custo de Mão de Obra R$ ---      Margem Vendas (%)       50,00 ← editável
Custo de Fabricação  R$ ---      Margem Ajustada (%)     auto
                                 Nota Fiscal (%)         12,00
RESERVA TÉCNICA                  Valor Final             R$ ---
─────────────────────────────
RT (%)               editável

LISTA DE FÁBRICAS HOMOLOGADAS
─────────────────────────────────────────────────────────
Fábrica            │ Filial/UF      │ Custo Fab │ Prazo  │ ✓
Leo Sob Medida     │ São Paulo - SP │ R$ -      │ 00 dias│ ☑
Ludwig             │ São Paulo - SP │ R$ -      │ 00 dias│ ☐
Boa Vista          │ São Paulo - SP │ R$ -      │ 00 dias│ ☐
```

**Por produto (modal "Configurações"):**
- Margem Vendas (%) — herdada do orçamento
- Margem Ajustada (%) — override individual por produto

**Nomenclatura Vigga vs terminologia comum:**
| Vigga | Ornato atual | Significado |
|---|---|---|
| Margem Operacional | Markup | Custo sobre operação |
| Margem Vendas | Margem bruta | % sobre preço de venda |
| Margem Ajustada | Desconto negociado | Override individual |
| Nota Fiscal | Imposto NF | % de nota fiscal |
| Reserva Técnica (RT) | Reserva técnica | % para imprevistos |
| Lista de Fábricas | Fornecedores | Fábricas parceiras com custo |

**No Ornato:** `config_taxas` table tem: margem_lucro, custos_fixos, imposto, desconto. O `divisor` do `engine.js` é equivalente à Margem Operacional.
**Gap:** Ornato não tem Lista de Fábricas, não tem Margem Ajustada por produto, e não separa custo de Mão de Obra de custo de Material.

---

### 17.6 — GESTÃO DE PROPOSTAS (lista + sidebar)

**URL:** `/admin/proposals/list_proposals/{id}`

Vigga organiza propostas em lista com painel lateral:

**Tabs do painel lateral:**
1. **Proposta** — dados gerais, link da proposta, template `{proposal_items}`
2. **Comentários** — anotações internas
3. **Lembretes** — follow-up com data
4. **Anotações** — notas gerais
5. **Rastrear** ← **funcionalidade-chave**

**Ações disponíveis:**
- ✏️ Editar — abre `/admin/proposals/proposal/{id}`
- 📧 Enviar por email — envia o link da proposta
- 👁️ Visualizar Proposta — preview como cliente vê

**Numeração automática:** PRO-000426 (número sequencial prefixado)

---

### 17.7 — RASTREAMENTO DE VISUALIZAÇÃO ⭐ FEATURE CHAVE

Esta é a funcionalidade que você perguntou sobre. O Vigga implementa **pixel tracking** na proposta online:

**Como funciona:**
1. Proposta aprovada recebe uma URL pública única: `https://studio.vigga.com.br/proposal/{id}/`
2. O vendedor envia essa URL para o cliente (por email, WhatsApp, etc.)
3. Quando o cliente **abre o link**, o sistema registra:
   - **Data e hora exatos** (ex: 27/01/2026 16:15:05)
   - **IP do cliente** (ex: 191.178.175.132)
4. Uma **notificação** aparece no sistema: *"Proposta PRO-000426 (teste 1) visualizada pelo cliente — 4 semanas atrás"*
5. O vendedor pode verificar no menu **Rastrear** da proposta

**Implementação técnica sugerida para Ornato:**
```sql
-- Tabela de rastreamento
CREATE TABLE proposta_acessos (
  id         INTEGER PRIMARY KEY,
  orc_id     INTEGER NOT NULL REFERENCES orcamentos(id),
  token      TEXT NOT NULL,           -- token único da URL pública
  acessado_em DATETIME NOT NULL,      -- timestamp do acesso
  ip_cliente TEXT,                    -- IP do visitante
  user_agent TEXT,                    -- navegador/dispositivo
  criado_em  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- No portal público, ao carregar a página:
-- INSERT INTO proposta_acessos (orc_id, token, acessado_em, ip_cliente)
-- VALUES (?, ?, datetime('now'), ?)
```

**Endpoint de tracking:**
```js
// GET /api/proposta-publica/:token
router.get('/proposta-publica/:token', async (req, res) => {
  const { token } = req.params;
  const orc = db.prepare('SELECT * FROM portal_tokens WHERE token=? AND ativo=1').get(token);
  if (!orc) return res.status(404).send('Proposta não encontrada');

  // Registra acesso
  db.prepare(`INSERT INTO proposta_acessos (orc_id, token, acessado_em, ip_cliente, user_agent)
              VALUES (?, ?, datetime('now'), ?, ?)`)
    .run(orc.orc_id, token, req.ip, req.headers['user-agent']);

  // Dispara notificação para o vendedor (via socket.io ou polling)
  notificarVendedor(orc.orc_id, 'proposta_visualizada');

  res.json(gerarDadosProposta(orc.orc_id));
});
```

**Notificação em tempo real:**
```js
// Usar socket.io ou polling a cada 30s no frontend
// Quando proposta é visualizada → toast: "🔔 João Silva acabou de ver seu orçamento!"
```

---

### 17.8 — PORTAL DO CLIENTE COM GANTT ⭐ FEATURE CHAVE

**URL pública do projeto:** `https://studio.vigga.com.br/clients/project/{id}?group=project_gantt`

O portal do cliente no Vigga é uma **aplicação separada** (sem menu admin) com:

**Tabs disponíveis para o cliente:**
1. **Visualização Gantt** — cronograma visual mensal (cores: Atrasado=laranja, Em Progresso=verde, Vence Hoje=amarelo, Completo=cinza)
2. **Visão geral de Projetos** — resumo executivo
3. **Tarefas** — lista de tarefas com status
4. **Etapas** — tabela com Nome + Descrição + Data de Início + Data de Vencimento
5. **Ocorrências** — sistema de chamados/discussões (Assunto + Últimas Atividades + Total de Comentários)
6. **Atividade** — log de atividades do projeto

**Etapas padrão de um projeto de marcenaria (Vigga):**
| Etapa | Início | Vencimento |
|---|---|---|
| Projeto Inicial | 27/01/2026 | 13/02/2026 |
| Medição | 14/02/2026 | 22/02/2026 |
| Projeto Executivo | 23/02/2026 | 12/03/2026 |
| Fabricação | 13/03/2026 | 01/05/2026 |
| Entrega | 02/05/2026 | 08/05/2026 |
| Montagem | 09/05/2026 | 06/06/2026 |

**KPIs visíveis:** Não Iniciado (20) | Em Progresso (0) | Em Atraso (7) | Completo (0) | Cancelado (0)

**Implementação sugerida para Ornato (seção 12 do roadmap expandida):**
```
ETAPAS PADRÃO DO PROJETO (configurável por empresa):
1. Levantamento/Medição
2. Projeto Inicial
3. Aprovação do Cliente ← cliente aprova aqui
4. Projeto Executivo (detailing)
5. Fabricação / Lotes de Corte ← cliente aprova lotes aqui
6. Entrega
7. Montagem
8. Vistoria Final
```

---

### 17.9 — MÓDULO DE PROJETOS (Gestão Interna)

**URL admin:** `/admin/projects/gantt`

**Funcionalidades:**
- **Gantt interativo** com visualização mensal/semanal/diária
- **+ Nova Tarefa** por projeto
- **Filtros:** por etapa, por status, por membro
- **"Exibir Tarefas"** toggle para mostrar/ocultar subtarefas
- **Acesso como cliente** — botão para abrir o portal do cliente
- **URL compartilhável** do projeto (input visível)
- **Status do projeto:** Não Iniciado, Em Progresso, Em Atraso, Completo, Cancelado

**Dependência entre tarefas:** seta visual mostrando que uma tarefa começa após outra terminar (Passagem de Bastão → Projeto Inicial → Escolha de Materiais)

---

### 17.10 — MENU DE NAVEGAÇÃO COMPLETO DO VIGGA

```
Painel
Clientes
Vendas
  └─ CRM
  └─ Planilha Ripada
Projetos  ← Gantt
Calendário
Financeiro
  └─ (submenu)
Tarefas
Utilidades
  └─ (submenu)
Definições
```

**Comparação com Ornato:**
| Seção | Vigga | Ornato | Gap |
|---|---|---|---|
| Dashboard | ✅ Painel | ✅ Dash | Similar |
| Clientes | ✅ | ✅ | Ornato sem CPF/endereço |
| CRM/Pipeline | ✅ CRM + Kanban Vendas | ✅ Kanban | Vigga tem mais |
| Orçamentos | ✅ Propostas | ✅ Orçamentos | Vigga tem rastrear |
| Projetos/Gantt | ✅ Gantt completo | ❌ Não tem | Gap crítico |
| Calendário | ✅ | ❌ Não tem | Gap |
| Financeiro/DRE | ✅ DRE integrado | ⚠️ Básico | Gap |
| Tarefas | ✅ | ❌ Não tem | Gap |
| Biblioteca | ⚠️ Embutido | ✅ Dedicado | Ornato superior |
| Motor Cálculo | ⚠️ Simples | ✅ Paramétrico | Ornato SUPERIOR |
| Documentos/PDF | ✅ | ❌ Não tem | Gap |
| Portal Cliente | ✅ Com Gantt | ❌ Não tem | Gap crítico |
| Rastrear proposta | ✅ | ❌ Não tem | Gap |

---

### 17.11 — FUNCIONALIDADES PARA EXTRAIR DO VIGGA

**Alta Prioridade (impacto direto nas vendas):**

1. **🔔 Rastreamento de visualização de proposta**
   - URL pública única por orçamento
   - Log com data/hora e IP quando cliente abre
   - Notificação em tempo real para o vendedor
   - Aba "Rastrear" na tela de detalhes do orçamento

2. **📊 Portal do Cliente com Gantt**
   - URL pública sem login: `/portal/:token`
   - Tabs: Gantt, Etapas, Ocorrências, Atividade
   - Etapas configuráveis (Medição, Projeto, Fabricação, Entrega, Montagem)
   - Status visual com cores
   - Sistema de ocorrências (cliente pode abrir chamados)

3. **🏭 Lista de Fábricas Homologadas**
   - Tabela de fábricas parceiras com custo e prazo
   - Seleção por orçamento (qual fábrica vai produzir)
   - Custo de fabricação entra no cálculo de custos

4. **📋 Margem por Produto (override)**
   - Cada produto pode ter sua própria margem ajustada
   - Herda a margem global mas pode ser sobrescrita
   - Ideal para produtos de maior/menor margem

**Média Prioridade:**

5. **🔑 Parâmetros protegidos por senha**
   - Painel de margens acessível apenas com senha (ex: sócios)
   - Evita que vendedor veja/altere as margens

6. **📅 Gantt interno + Etapas do Projeto**
   - 6 etapas padrão configuráveis
   - Datas de início/vencimento por etapa
   - KPIs: Em Atraso, Em Progresso, Completo

7. **🔔 Lembretes e Anotações por Orçamento**
   - Aba "Lembretes" com data de follow-up
   - Aba "Anotações" para notas internas
   - Aba "Comentários" para comunicação interna

8. **🏷️ Numeração automática de proposta**
   - Formato: ORN-000001 (ORN = Ornato)
   - Sequencial por empresa
   - Visível no PDF e no cliente

**Baixa Prioridade (diferencial de mercado):**

9. **🪑 Seleção de marca de ferragens por proposta**
   - Corrediças: HAFELE / FGVTN / BLUM / OPENFIELD
   - Dobradiças: HAFELE / FGVTN / BLUM / OPENFIELD
   - Impacto no custo via tabela de preços por marca

10. **📱 "Planilha Ripada" (Vigga Vendas)**
    - Planilha de acompanhamento de vendas
    - Pipeline visual por vendedor

---

### 17.12 — COMPARATIVO FINAL: ORNATO × VIGGA × SISMARCENARIA

| Feature | Ornato | Vigga | Sismarcenaria |
|---|---|---|---|
| Motor paramétrico | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Catálogo de produtos | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Subitens hierárquicos | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Acabamento EXT/INT | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Margem por produto | ❌ | ⭐⭐⭐⭐ | ❌ |
| Lista de fábricas | ❌ | ⭐⭐⭐⭐ | ❌ |
| Geração de PDF | ❌ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Rastreamento proposta | ❌ | ⭐⭐⭐⭐⭐ | ❌ |
| Portal do cliente | ❌ | ⭐⭐⭐⭐⭐ | ❌ |
| Gantt de projeto | ❌ | ⭐⭐⭐⭐⭐ | ❌ |
| Editor de contrato | ❌ | ❌ | ⭐⭐⭐⭐⭐ |
| Logo no documento | ❌ | ❌ | ⭐⭐⭐⭐⭐ |
| CRM/Pipeline | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Cadastro clientes | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| UX/Interface | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

**Conclusão:** O Ornato tem o melhor motor de cálculo do mercado. Precisa absorver o que os outros têm de bom: rastreamento de proposta e portal do cliente do Vigga + geração de documentos do Sismarcenaria.

---

## 📞 Contato e Contexto

**Sistema:** Ornato ERP v2.0
**Empresa:** Studio Ornato Móveis Ltda
**Stack:** React 18 + Node.js/Express + SQLite → PostgreSQL
**Repositório:** `/Users/madeira/SISTEMA NOVO/`
**Referências de mercado analisadas:** sismarcenaria.com.br + studio.vigga.com.br

---

*Documento gerado automaticamente por análise de Claude Sonnet — Fev/2026*
