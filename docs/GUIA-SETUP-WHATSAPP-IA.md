# Guia de Setup — WhatsApp IA Studio Ornato
## Evolution API + n8n + Claude no VPS Hostinger

---

## Visão Geral

```
WhatsApp → Evolution API → n8n → Claude API → Resposta ao Cliente
                                      ↓
                    (handoff) → Mensagem no seu WhatsApp pessoal
```

**O que você vai instalar:**
- **Docker** — ambiente de containers
- **Evolution API** — conector WhatsApp (open source)
- **n8n** — automação de workflows
- **Workflow Ornato** — o algoritmo pronto (arquivo JSON)

**Tempo estimado:** 1h30 na primeira vez

---

## Pré-requisitos

- VPS Hostinger ativa (Ubuntu 22.04 recomendado)
- Acesso SSH root: `ssh root@srv1436363`
- Chave da API Anthropic: https://console.anthropic.com → API Keys
- Número de WhatsApp **dedicado** (chip de atendimento — não o número principal)
- Seu número pessoal no formato internacional: `5598XXXXXXXXX`

---

## Parte 1 — Preparar o Servidor

### 1.1 Conectar ao VPS

```bash
ssh root@srv1436363
```

### 1.2 Atualizar o sistema

```bash
apt update && apt upgrade -y
```

### 1.3 Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### 1.4 Instalar Docker Compose

```bash
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### 1.5 Criar estrutura de pastas

```bash
mkdir -p /home/ornato/whatsapp
cd /home/ornato/whatsapp
```

---

## Parte 2 — Configurar os Serviços

### 2.1 Criar o arquivo docker-compose.yml

Substitua antes de colar:
- `SUA_CHAVE_ANTHROPIC` → chave `sk-ant-...`
- `SEU_IP_VPS` → IP público do servidor
- `SEU_NUMERO` → seu número pessoal (ex: `5598991234567`)

```bash
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://localhost:8080
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=ornato-evolution-key-2024
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
      - QRCODE_LIMIT=30
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution:evolution123@postgres:5432/evolution
      - RABBITMQ_ENABLED=false
      - REDIS_ENABLED=false
      - LOG_LEVEL=ERROR
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    container_name: evolution_postgres
    restart: always
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evolution123
    volumes:
      - postgres_data:/var/lib/postgresql/data

  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - WEBHOOK_URL=http://SEU_IP_VPS:5678
      - GENERIC_TIMEZONE=America/Fortaleza
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=ornato2024
      - ANTHROPIC_API_KEY=SUA_CHAVE_ANTHROPIC
      - EVOLUTION_INSTANCE=ornato
      - EVOLUTION_API_KEY=ornato-evolution-key-2024
      - OWNER_PHONE=SEU_NUMERO
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  postgres_data:
  n8n_data:
EOF
```

### 2.2 Subir os containers

```bash
docker-compose up -d
```

Verifique:
```bash
docker-compose ps
```

Os 3 containers devem aparecer como `Up`.

---

## Parte 3 — Conectar o WhatsApp

### 3.1 Criar a instância

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{"instanceName": "ornato", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```

### 3.2 Gerar o QR Code

```bash
curl -X GET http://localhost:8080/instance/connect/ornato \
  -H "apikey: ornato-evolution-key-2024"
```

Copie o campo `base64` e visualize em: https://base64.guru/converter/decode/image

Ou acesse o painel: `http://SEU_IP_VPS:8080/manager` (senha: `ornato-evolution-key-2024`)

### 3.3 Escanear no celular

No celular com o número dedicado:
1. WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho
2. Escanear o QR Code

### 3.4 Verificar conexão

```bash
curl -X GET http://localhost:8080/instance/fetchInstances \
  -H "apikey: ornato-evolution-key-2024"
```

Procure `"state":"open"`.

---

## Parte 4 — Importar o Workflow no n8n

### 4.1 Acessar o n8n

```
http://SEU_IP_VPS:5678
```
Login: `admin` / `ornato2024`

### 4.2 Importar

1. **Workflows** → `+` → `...` (3 pontinhos) → **Import from file**
2. Selecione o arquivo `n8n-workflow-ornato.json`

### 4.3 Ativar

Toggle **Inactive → Active** no canto superior direito.

### 4.4 Pegar a URL do Webhook

Clique no node **Receber Mensagem** → copie a **Webhook URL**:
```
http://SEU_IP_VPS:5678/webhook/whatsapp
```

---

## Parte 5 — Registrar o Webhook

```bash
curl -X POST http://localhost:8080/webhook/set/ornato \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{
    "url": "http://SEU_IP_VPS:5678/webhook/whatsapp",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## Parte 6 — Como Funciona a Notificação de Handoff

Quando a Sofia identificar que o lead precisa de atendimento humano, ela automaticamente envia uma mensagem no **seu WhatsApp pessoal** (o número configurado em `OWNER_PHONE`):

```
🔔 LEAD PARA ATENDIMENTO HUMANO

Nome: [nome do lead]
Telefone: [número]

Última mensagem do lead:
"[o que o lead disse]"

Abra o WhatsApp para assumir o atendimento.
```

Depois disso, a Sofia para de responder automaticamente para aquele lead — você assume a conversa de onde ela parou.

---

## Parte 7 — Manutenção

### Reiniciar tudo
```bash
cd /home/ornato/whatsapp && docker-compose restart
```

### Ver logs em tempo real
```bash
docker logs n8n -f
docker logs evolution_api -f
```

### Atualizar Evolution API
```bash
docker-compose pull evolution-api && docker-compose up -d evolution-api
```

### Backup
```bash
docker run --rm -v n8n_data:/data -v $(pwd):/backup alpine tar czf /backup/n8n-backup-$(date +%Y%m%d).tar.gz /data
```

---

## Resumo das Variáveis

| Variável | Descrição |
|---|---|
| `EVOLUTION_API_KEY` | `ornato-evolution-key-2024` — senha interna da Evolution API |
| `EVOLUTION_INSTANCE` | `ornato` — nome da instância WhatsApp |
| `ANTHROPIC_API_KEY` | Sua chave `sk-ant-...` do console Anthropic |
| `OWNER_PHONE` | Seu número pessoal `5598XXXXXXXXX` para receber notificações |
| `N8N_BASIC_AUTH_PASSWORD` | `ornato2024` — senha de acesso ao painel n8n |

---

## Resolução de Problemas

### Portas bloqueadas
```bash
ufw allow 8080 && ufw allow 5678
```

### QR Code expirou
```bash
curl -X DELETE http://localhost:8080/instance/logout/ornato \
  -H "apikey: ornato-evolution-key-2024"
```
Depois gere novo QR Code.

### Webhook não chega no n8n
1. Confirme que o workflow está **Active**
2. Teste manualmente:
```bash
curl -X POST http://localhost:5678/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert","instance":"ornato","data":{"key":{"remoteJid":"5511999999999@s.whatsapp.net","fromMe":false},"message":{"conversation":"oi"},"messageType":"conversation","pushName":"Teste"}}'
```

### Claude não responde
```bash
docker logs n8n --tail=100
```
Procure `401` (chave inválida) ou `429` (limite atingido).

---

## Checklist Final

- [ ] Docker e Docker Compose instalados
- [ ] 3 containers rodando (`Up`)
- [ ] Instância `ornato` criada
- [ ] WhatsApp conectado (`"state":"open"`)
- [ ] Workflow importado e ativo no n8n
- [ ] Webhook registrado na Evolution API
- [ ] Teste de mensagem respondido pela Sofia
- [ ] Notificação de handoff chegando no WhatsApp pessoal

---

*90% dos problemas aparecem nos logs. Sempre rode `docker logs n8n -f` quando algo não funcionar.*
