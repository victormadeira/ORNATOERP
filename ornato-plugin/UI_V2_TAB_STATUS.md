# UI v2 — Status dos Tabs (Plugin SketchUp)

Inventário em **2026-05-10** dos 9 tabs do painel v2 em
`ornato-plugin/ornato_sketchup/ui/v2/tabs/`.

Classificação:
- ✅ **Real** — `render(container, ctx)` real, callbacks Ruby, state local/global, UI implementada.
- 🟡 **Parcial** — estrutura inicial mas dados hardcoded / fluxo incompleto.
- ❌ **Placeholder** — stub de 6 linhas: `export const meta = { phase: 'F1.1' }`. App.js usa `renderEmptyTab` por default.

## Tabela de status

| # | Tab            | Arquivo          | Status | Linhas | Callbacks Ruby                                                                                                     | Próximo passo                                                          |
|---|----------------|------------------|--------|--------|--------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| 1 | Projeto        | `projeto.js`     | ❌     | 6      | nenhum                                                                                                             | Definir contrato (info projeto + cliente + ambientes) e render skeleton |
| 2 | Ambiente       | `ambiente.js`    | ❌     | 6      | nenhum                                                                                                             | Listar ambientes do projeto, switch ativo, sync com SketchUp scene     |
| 3 | Biblioteca     | `biblioteca.js`  | ❌     | 6      | nenhum                                                                                                             | Mover lógica do painel legacy (search/filters/insert) pra v2           |
| 4 | Internos       | `internos.js`    | ❌     | 6      | nenhum                                                                                                             | Aguardar engine de internos (prateleiras/divisórias) — fase 2          |
| 5 | Acabamentos    | `acabamentos.js` | ❌     | 6      | nenhum                                                                                                             | Picker MDF/laca/borda, aplicar por seleção                             |
| 6 | Ferragens      | `ferragens.js`   | ✅     | 202    | `get_module_machining`, retorno `setModuleMachining`                                                                | Sprint futuro: preview SVG + cotas + overrides + modo lote             |
| 7 | Usinagens      | `usinagens.js`   | ❌     | 6      | nenhum                                                                                                             | Reaproveitar dados de `ferragens` (structural_ops) + render por face   |
| 8 | Validação      | `validacao.js`   | ✅     | 259    | `run_validation`, `select_entity_in_model`, `auto_fix_issue`, `ignore_validation_issue`, `get_ignored_issues`       | Pequenos: histórico de runs + export CSV; core já em produção          |
| 9 | Produção       | `producao.js`    | ❌     | 6      | nenhum                                                                                                             | Bridge com BOM/Plano de Corte (server `/api/plugin/projeto/:id/bom`)   |

**Resumo**: 2 reais · 0 parciais · 7 placeholders. Total 685 linhas (445 são `ferragens` + `validacao` + `index`).

> Obs.: o briefing FIX-3 menciona um "Inspector" como tab real, mas no diretório atual ele **não existe** como `inspector.js`. A funcionalidade equivalente está embutida em `ferragens.js` (inspeção de peça selecionada). Vale renomear a tab ou criar `inspector.js` dedicado se a navegação foi prometida na UI.

## Roadmap placeholder → real

### MVP (próximas 2 sprints — necessário para o plugin "fazer alguma coisa útil sem o painel legacy")
1. **Projeto** — sem ele, o painel não tem âncora de identidade. Render só leitura inicialmente.
2. **Biblioteca** — porting do painel legacy; é o tab de maior uso diário.
3. **Produção** — fecha o loop "modelei → mando produção" e amarra com BOM/CNC já existentes no server.

### V2 (sprints 3-5 — depois que MVP estabilizar)
4. **Ambiente** — só faz sentido quando "Projeto" estiver vivo.
5. **Acabamentos** — depende do catálogo de MDF estar normalizado (já existe).
6. **Usinagens** — derivado de `ferragens`, ganho marginal alto, custo médio.

### Backlog / fase 2 (aguardar engine)
7. **Internos** — engine de prateleiras/divisórias ainda não modelada; risco alto de retrabalho. Deixar placeholder até spec fechar.

## Estimativa de horas (engenheiro pleno familiar com a base v2)

| Tab          | Complexidade | Bridge Ruby | UI         | Estimado |
|--------------|--------------|-------------|------------|---------:|
| Projeto      | Baixa        | 1 callback  | Skeleton   | **6h**   |
| Ambiente     | Média        | 2-3         | Lista+CRUD | **12h**  |
| Biblioteca   | Alta (porting) | 4-5       | Reuso v1   | **24h**  |
| Internos     | Muito alta   | engine nova | engine nova| **40h+** (bloqueado por spec) |
| Acabamentos  | Média        | 2           | Picker     | **10h**  |
| Usinagens    | Média        | reuso       | Render face| **14h**  |
| Produção     | Média-alta   | 3 (BOM/proposta/PDF) | Lista + ações | **18h** |
| Total MVP (Projeto+Biblioteca+Produção)        |             |            | **~48h** |
| Total V2 (Ambiente+Acabamentos+Usinagens)      |             |            | **~36h** |
| Total backlog (Internos)                       |             |            | **~40h+**|

Não inclui QA, polish visual e regressão de fluxo do painel legacy.

## Critério de "Real"

Para um tab sair de ❌ → ✅ na próxima auditoria, deve cumprir:
1. `export function render(container, ctx)` real (>= 50 linhas).
2. Pelo menos 1 `callRuby()` ativo OU consumo de `ctx.state` mutável.
3. Estado vazio + erro + loading com mensagens em PT-BR.
4. Ícone via `iconHTML()` (sem emoji cru, exceto no caso pontual de severidade).
5. Reage a `selection` (quando aplicável) — vide `ferragens.js` como referência.

`validacao.js` e `ferragens.js` são os exemplos canônicos a copiar.
