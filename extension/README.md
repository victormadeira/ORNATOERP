# Ornato ERP — Extensão Chrome (WhatsApp Web Sidebar)

Injeta uma sidebar no `web.whatsapp.com` mostrando, para o contato do chat ativo:

- **👤 Cliente** — dados cadastrados no ERP
- **💰 Orçamentos** — histórico (status, valor, data)
- **🤖 Sofia** — qualificação do lead (score, temperatura), estado da conversa, dossiê, controle de pausar IA e "aguardar cliente"

## Instalação (modo desenvolvedor)

1. Acesse `chrome://extensions/`
2. Ative "Modo do desenvolvedor" (canto superior direito)
3. Clique em "Carregar sem compactação"
4. Selecione a pasta `extension/` deste repositório

## Configuração

1. No ERP: `Configurações → IA → Extensão Chrome — tokens de acesso` → `Gerar token`
2. Copie o token (só aparece uma vez)
3. Clique no ícone da extensão no Chrome → cole a URL do ERP e o token → "Salvar e testar"

Cada pessoa deve gerar e usar o próprio token. Não compartilhe.

## Como usar

- Abra `web.whatsapp.com`
- A sidebar aparece colapsada no canto direito (botão `ORN`)
- Clique nele para expandir. Ao trocar de chat, a sidebar atualiza automaticamente.

## Limitações atuais (MVP)

- Só enxerga conversas que já passaram pelo webhook (futuro: sync histórico via DOM)
- Templates de mensagem virão na próxima iteração
- Badge numerada mostra quantos handoffs estão em escalação pendente

## Arquitetura

- `manifest.json` — Manifest V3
- `background.js` — service worker, ponte para chamadas API (evita CORS)
- `content.js` — injeta sidebar, observa DOM do WhatsApp Web, detecta telefone do chat ativo
- `sidebar.css` — estilo da sidebar (dark, cores Ornato)
- `popup.html/js` — configuração de URL + token

## Endpoints usados

- `GET  /api/ext/me` — valida token
- `GET  /api/ext/cliente-por-tel/:tel` — resolve contato
- `GET  /api/ext/orcamentos-por-cliente/:id` — histórico
- `GET  /api/ext/sofia-status/:conversaId` — qualificação + estado
- `PUT  /api/ext/pausar-ia/:conversaId`
- `PUT  /api/ext/aguardando-cliente/:conversaId`
- `GET  /api/whatsapp/conversas` (via token JWT opcional, usado pelo badge)

Todos autenticados via header `x-ext-token`.
