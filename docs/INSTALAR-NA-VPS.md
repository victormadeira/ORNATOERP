# Instalação Completa na VPS
## Cole direto no terminal da Hostinger

---

## ANTES DE COLAR — Edite as 3 linhas do topo

Abra o bloco abaixo, substitua os 3 valores e cole tudo de uma vez no terminal:

- `SUA_CHAVE_ANTHROPIC` → sua chave `sk-ant-api03-...`
- `IP_DO_VPS` → o IP do seu servidor (ex: `82.115.21.45`)
- `SEU_NUMERO` → seu número pessoal (ex: `5598991234567`)

---

```bash
# ============================================================
# EDITE APENAS ESTA LINHA ANTES DE COLAR:
VPS_IP="COLOQUE-O-IP-DO-VPS-AQUI"
# Chave Anthropic e número de notificação são configurados
# direto no sistema em: Configurações → WhatsApp e IA
# ============================================================

# Atualizar sistema
apt update && apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Instalar Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Criar pasta do projeto
mkdir -p /home/ornato/whatsapp
cd /home/ornato/whatsapp

# Criar arquivo de configuração
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
      # Chave Anthropic, instância e número de notificação são
      # configurados direto no sistema em Configurações → IA e WhatsApp
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  postgres_data:
  n8n_data:
ENDOFFILE

# Subir todos os containers
docker-compose up -d

# Aguardar inicialização
echo "Aguardando containers iniciarem..."
sleep 15

# Criar instância do WhatsApp
curl -s -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{"instanceName": "ornato", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'

# Abrir portas no firewall
ufw allow 22
ufw allow 8080
ufw allow 5678
ufw --force enable

echo ""
echo "============================================================"
echo "  INSTALAÇÃO CONCLUÍDA!"
echo "============================================================"
echo ""
echo "  Painel Evolution API:"
echo "  http://${VPS_IP}:8080/manager"
echo "  Senha: ornato-evolution-key-2024"
echo ""
echo "  Painel n8n:"
echo "  http://${VPS_IP}:5678"
echo "  Usuário: admin | Senha: ornato2024"
echo ""
echo "  Próximo passo: conectar o WhatsApp."
echo "  Acesse o painel da Evolution API acima e escaneie o QR Code."
echo "============================================================"
```

---

## Depois que terminar — Conectar o WhatsApp

Quando aparecer a mensagem `INSTALAÇÃO CONCLUÍDA`, acesse no navegador do seu celular ou computador:

```
http://SEU_IP:8080/manager
```

- Senha: `ornato-evolution-key-2024`
- Clique na instância `ornato`
- O QR Code vai aparecer — escaneie pelo WhatsApp do chip dedicado

---

## Depois que conectar o WhatsApp — Registrar o Webhook

Cole este comando no terminal (substitua o IP):

```bash
curl -X POST http://localhost:8080/webhook/set/ornato \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{
    "url": "http://SEU_IP:5678/webhook/whatsapp",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## Verificar se está tudo rodando

```bash
docker-compose -f /home/ornato/whatsapp/docker-compose.yml ps
```

Deve mostrar 3 linhas com `Up`.
