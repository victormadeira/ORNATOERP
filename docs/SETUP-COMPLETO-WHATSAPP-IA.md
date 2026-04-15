# Setup Completo — WhatsApp IA
## Evolution API + n8n + Claude — do zero ao funcionando

> Cole os comandos no terminal da VPS (painel Hostinger → VPS → Terminal)

---

## PARTE 1 — Instalar tudo na VPS

### 1.1 — Abrir o terminal da VPS

1. Acesse **https://hpanel.hostinger.com**
2. Clique em **VPS** no menu lateral
3. Clique no seu servidor
4. Clique em **Terminal** (ou use SSH: `ssh root@srv1436363`)

---

### 1.2 — Instalar Docker e subir os serviços

Edite as 2 linhas marcadas antes de colar. Cole tudo de uma vez:

```bash
# ── EDITE AQUI ──────────────────────────────────────────
VPS_IP="SEU_IP_AQUI"          # ex: 82.115.21.45
# ────────────────────────────────────────────────────────

apt update && apt upgrade -y

curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose

mkdir -p /home/ornato/whatsapp && cd /home/ornato/whatsapp

cat > docker-compose.yml << ENDOFFILE
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
      - WEBHOOK_URL=http://${VPS_IP}:5678
      - GENERIC_TIMEZONE=America/Fortaleza
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=ornato2024
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  postgres_data:
  n8n_data:
ENDOFFILE

docker-compose up -d

sleep 15

ufw allow 22 && ufw allow 8080 && ufw allow 5678 && ufw --force enable

echo "✅ Serviços no ar. Evolution: http://${VPS_IP}:8080 | n8n: http://${VPS_IP}:5678"
```

Aguarde ~2 minutos. Quando aparecer a mensagem `✅ Serviços no ar`, siga para a próxima parte.

---

## PARTE 2 — Configurar o n8n

### 2.1 — Acessar o painel do n8n

Abra no navegador:
```
http://SEU_IP:5678
```

**Primeira vez:** vai pedir para criar conta
- Preencha nome, e-mail e senha (qualquer valor — é só para acesso local)
- Clique em **Get started**

---

### 2.2 — Gerar a API Key do n8n

Isso é necessário para que o sistema ERP possa controlar o n8n (ativar/desativar Sofia, ver status).

1. No menu lateral esquerdo, clique no seu **nome/avatar** (canto inferior esquerdo)
2. Clique em **Settings**
3. No menu que abrir, clique em **n8n API**
4. Clique em **Create an API key**
5. Dê o nome: `ornato-erp`
6. Clique em **Create**
7. **Copie a chave gerada** — começa com `n8n_api_...`
8. Guarde essa chave — você vai precisar dela no Passo 3.3

---

### 2.3 — Importar o workflow da Sofia

1. No menu lateral esquerdo, clique em **Workflows**
2. Clique no botão **+ New workflow** (canto superior direito)
3. Na tela em branco que abrir, clique nos **três pontinhos** `···` (canto superior direito)
4. Clique em **Import from file**
5. Selecione o arquivo:
   - No seu Mac: `/Users/madeira/SISTEMA NOVO/docs/n8n-workflow-ornato.json`
   - Ou transfira o arquivo primeiro via SFTP/upload
6. O workflow vai aparecer com todos os blocos coloridos conectados
7. Clique em **Save** (ícone de disquete ou `Ctrl+S`)

---

### 2.4 — Ativar o workflow

No canto superior direito da tela do workflow:
- Tem um toggle escrito **Inactive** (cinza)
- Clique nele → vai mudar para **Active** (verde) ✓

---

### 2.5 — Pegar a URL do Webhook

1. Clique no primeiro bloco do workflow chamado **📱 Receber Mensagem**
2. No painel lateral que abrir, procure **Webhook URL**
3. Anote essa URL — será algo assim:
   ```
   http://SEU_IP:5678/webhook/whatsapp
   ```

---

## PARTE 3 — Configurar o Evolution API (WhatsApp)

### 3.1 — Acessar o painel da Evolution API

Abra no navegador:
```
http://SEU_IP:8080/manager
```

Quando pedir autenticação:
- **Global API Key:** `ornato-evolution-key-2024`

---

### 3.2 — Criar a instância do WhatsApp

No terminal da VPS, cole:

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{"instanceName": "ornato", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```

Deve aparecer `"instanceName":"ornato"` na resposta.

---

### 3.3 — Conectar o WhatsApp (QR Code)

**Via painel** (mais fácil):
1. Acesse `http://SEU_IP:8080/manager`
2. Clique na instância **ornato**
3. O QR Code vai aparecer na tela

**Via terminal:**
```bash
curl -X GET http://localhost:8080/instance/connect/ornato \
  -H "apikey: ornato-evolution-key-2024"
```
Copie o campo `base64` e visualize em: **https://base64.guru/converter/decode/image**

**Escanear no celular** (chip dedicado):
1. WhatsApp → ⋮ (três pontos) → **Aparelhos conectados**
2. **Conectar um aparelho**
3. Aponte para o QR Code

> Você tem 60 segundos. Se expirar, repita o comando acima.

**Confirmar conexão:**
```bash
curl -X GET http://localhost:8080/instance/fetchInstances \
  -H "apikey: ornato-evolution-key-2024"
```
Procure `"state":"open"` ✓

---

### 3.4 — Registrar o Webhook (conectar Evolution → n8n)

Cole no terminal (substituindo o IP):

```bash
VPS_IP="SEU_IP_AQUI"

curl -X POST http://localhost:8080/webhook/set/ornato \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d "{
    \"url\": \"http://${VPS_IP}:5678/webhook/whatsapp\",
    \"webhook_by_events\": false,
    \"webhook_base64\": false,
    \"events\": [\"MESSAGES_UPSERT\"]
  }"
```

Resposta esperada: `"enabled":true` ✓

---

## PARTE 4 — Configurar no Sistema ERP (Ornato)

Acesse seu sistema ERP → menu **Configurações** → aba **WhatsApp**

Preencha os campos:

| Campo | Valor |
|---|---|
| URL da Instância | `http://SEU_IP:8080` |
| Nome da Instância | `ornato` |
| API Key | `ornato-evolution-key-2024` |
| Número para Notificações | `5598991234567` (seu número pessoal) |

Clique em **Salvar**.

---

Depois vá para a aba **Inteligência Artificial**:

| Campo | Valor |
|---|---|
| Provedor | `Anthropic` |
| Chave API | `sk-ant-api03-...` (sua chave de **https://console.anthropic.com**) |
| Modelo | `claude-haiku-4-5-20251001` |

Clique em **Salvar**.

---

## PARTE 5 — Testar

1. Pegue outro celular
2. Envie mensagem para o número conectado
3. Aguarde ~5 segundos
4. A **Sofia** responde ✓

Se não responder:
```bash
docker logs n8n --tail=50
```

---

## PARTE 6 — Comandos úteis do dia a dia

```bash
# Ver se tudo está rodando
docker-compose -f /home/ornato/whatsapp/docker-compose.yml ps

# Ver logs em tempo real
docker logs n8n -f
docker logs evolution_api -f

# Reiniciar tudo
cd /home/ornato/whatsapp && docker-compose restart

# Desconectar WhatsApp (para reconectar com novo QR)
curl -X DELETE http://localhost:8080/instance/logout/ornato \
  -H "apikey: ornato-evolution-key-2024"

# Ver conversas ativas
curl -X GET http://localhost:8080/instance/fetchInstances \
  -H "apikey: ornato-evolution-key-2024"
```

---

## Checklist — marque cada item

- [ ] Docker instalado e rodando
- [ ] 3 containers no ar (`docker-compose ps` mostra `Up`)
- [ ] n8n acessível em `http://IP:5678`
- [ ] Conta criada no n8n
- [ ] **API Key do n8n gerada e salva**
- [ ] Workflow importado no n8n
- [ ] Workflow **ativo** (toggle verde)
- [ ] Evolution API acessível em `http://IP:8080/manager`
- [ ] Instância `ornato` criada
- [ ] WhatsApp conectado (`"state":"open"`)
- [ ] Webhook registrado (`"enabled":true`)
- [ ] Chave Anthropic configurada no ERP
- [ ] Número de notificação configurado no ERP
- [ ] Teste realizado — Sofia respondeu ✓

---

## Resumo de senhas e portas

| Serviço | Endereço | Usuário/Senha |
|---|---|---|
| n8n (painel) | `http://IP:5678` | admin / ornato2024 |
| Evolution API | `http://IP:8080/manager` | — / `ornato-evolution-key-2024` |
| n8n API Key | gerada no Passo 2.2 | começa com `n8n_api_...` |
| Anthropic API | https://console.anthropic.com | sua conta |
