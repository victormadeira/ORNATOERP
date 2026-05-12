# Testes E2E (Playwright)

Cobre fluxos críticos que, se quebram, param o negócio:

- **login.spec.js** — login válido + inválido (sem login, ninguém entra)
- **portal-publico.spec.js** — portal do cliente acessível por token (link enviado já está na mão de clientes)
- **landing.spec.js** — raiz pública renderiza + OG tags (Meta Ads cai aqui)

## Setup inicial (uma vez por máquina)

```bash
npx playwright install chromium
```

Baixa o Chromium (~150MB).

## Rodar

```bash
# Sobe dev server antes (em outra aba):
npm run dev

# Em outra aba:
npm run test:e2e           # headless, console
npm run test:e2e:headed    # abre Chrome pra ver o que tá rolando
npm run test:e2e:ui        # UI interativa do Playwright
```

## Variáveis de ambiente

```bash
E2E_BASE_URL=http://localhost:5173     # alvo dos testes
E2E_USER=admin@ornato.com              # credenciais de teste
E2E_PASS=admin
E2E_PORTAL_TOKEN=abc123...             # token de portal pra teste (skip se vazio)
```

Exemplo:

```bash
E2E_USER=victor@ornato.com E2E_PASS=minhasenha npm run test:e2e
```

## Quando adicionar um teste novo

Não cubra TUDO. Adicione um spec quando o fluxo:
- É a **porta de entrada** de alguém (cliente, vendedor, montador)
- É **monetário** (pagamento, fechamento de orçamento)
- Foi alvo de **bug grave no passado** (regressão futura é cara)

Mantém suite enxuta. Cada teste lento amortiza o ciclo de dev.

## CI

`playwright.config.js` ajusta `retries: 1` e `reporter: 'github'` quando `CI=true`. Adicione step no workflow:

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npm run test:e2e
  env:
    CI: true
    E2E_USER: ${{ secrets.E2E_USER }}
    E2E_PASS: ${{ secrets.E2E_PASS }}
```
