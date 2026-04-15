# Tutorial Completo — WhatsApp IA Ornato
## Do zero ao funcionando. Nível: nunca mexi em servidor na vida.

---

> **Tempo total:** ~2 horas
> **Dificuldade:** Você só vai copiar e colar comandos. Sério.
> **O que você precisa antes de começar:** ver a lista abaixo.

---

## ANTES DE COMEÇAR — Separe isso tudo

### Coisas que você já tem:
- [ ] Acesso SSH ao VPS Hostinger
- [ ] Um celular com um número de WhatsApp **dedicado** (não pode ser seu número principal — use um chip de atendimento)

### Passo 0A — Ver o IP do seu VPS

1. Acesse: **https://hpanel.hostinger.com**
2. Faça login com sua conta Hostinger
3. No menu lateral, clique em **VPS**
4. Clique no seu servidor
5. O IP aparece na tela principal — anote (ex: `82.115.21.45`)

---

### Passo 0B — Criar a Chave da API Anthropic (a IA que vai responder)

1. Acesse: **https://console.anthropic.com**
2. Clique em **Sign Up** para criar conta (ou **Log In** se já tiver)
3. Confirme o e-mail se pedido
4. No menu lateral esquerdo, clique em **API Keys**
5. Clique no botão **+ Create Key**
6. Dê um nome (ex: `ornato-sofia`)
7. A chave vai aparecer — começa com `sk-ant-api03-...`
8. **COPIE agora e guarde num bloco de notas. Você só vê ela uma vez.**

> **Atenção:** A API Anthropic tem um custo por uso. Para o volume de uma marcenaria pequena (~200 mensagens/mês), o custo é em torno de **R$ 5–15/mês**. Acesse **https://console.anthropic.com/settings/billing** para configurar um método de pagamento antes de começar.

---

### Passo 0C — Seu número pessoal

Quando um lead precisar de atendimento humano, a Sofia vai te mandar mensagem no **seu WhatsApp pessoal**.

Anote seu número no formato internacional:
- Formato: `5598XXXXXXXXX`
- 55 = Brasil | 98 = DDD São Luís | + o número sem espaços
- Exemplo: `5598991234567`

---

Seu bloco de notas deve ter isso agora:
```
IP do VPS:          82.115.21.45   (o seu)
Chave Anthropic:    sk-ant-api03-XXXXXXXXXXXXXXX
Meu número WA:      5598991234567
```

---

## PASSO 1 — Abrir o Terminal e Conectar ao Servidor

### No Mac:
1. Aperte `Command (⌘) + Espaço`
2. Digite `Terminal` e aperte Enter
3. Uma janela escura vai abrir

### No Windows:
1. Aperte `Windows + R`
2. Digite `cmd` e aperte Enter

### Conectar no servidor:

Cole este comando e aperte Enter:
```
ssh root@srv1436363
```

Na primeira vez vai aparecer:
```
Are you sure you want to continue connecting (yes/no)?
```
Digite `yes` e aperte Enter.

Se pedir senha — é a senha root do VPS que você recebeu da Hostinger por e-mail.

**Se deu certo** o terminal vai mostrar:
```
root@srv1436363:~#
```
Você está dentro do servidor. Agora tudo que você digitar aqui roda no servidor.

---

## PASSO 2 — Instalar o Docker

O Docker é o programa que vai rodar tudo dentro do servidor. Cole cada linha **uma por vez** e aperte Enter após cada uma:

**Linha 1 — Atualizar o sistema:**
```bash
apt update && apt upgrade -y
```
> Texto vai passar na tela. Normal. Aguarde o `#` aparecer novamente.

**Linha 2 — Instalar o Docker:**
```bash
curl -fsSL https://get.docker.com | sh
```
> Aguarde ~2 minutos.

**Linha 3 — Fazer o Docker iniciar automaticamente:**
```bash
systemctl enable docker && systemctl start docker
```

**Linha 4 — Instalar o Docker Compose:**
```bash
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
```

**Linha 5 — Confirmar que funcionou:**
```bash
docker-compose --version
```
> Deve aparecer: `Docker Compose version v2.x.x` ✓

---

## PASSO 3 — Criar a Pasta do Projeto

```bash
mkdir -p /home/ornato/whatsapp && cd /home/ornato/whatsapp
```

---

## PASSO 4 — Criar o Arquivo de Configuração

Agora você vai criar o arquivo com todas as configurações do sistema.

> **ANTES DE COLAR** — substitua os 3 valores marcados com `<<<` pelos seus dados reais:
> - `<<<IP_DO_VPS>>>` → ex: `82.115.21.45`
> - `<<<SUA_CHAVE_ANTHROPIC>>>` → ex: `sk-ant-api03-xxxx`
> - `<<<SEU_NUMERO_WHATSAPP>>>` → ex: `5598991234567`

Cole o bloco abaixo **inteiro** de uma vez (com seus dados já substituídos):

```bash
cat > /home/ornato/whatsapp/docker-compose.yml << 'ENDOFFILE'
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
      - WEBHOOK_URL=http://<<<IP_DO_VPS>>>:5678
      - GENERIC_TIMEZONE=America/Fortaleza
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=ornato2024
      - ANTHROPIC_API_KEY=<<<SUA_CHAVE_ANTHROPIC>>>
      - EVOLUTION_INSTANCE=ornato
      - EVOLUTION_API_KEY=ornato-evolution-key-2024
      - OWNER_PHONE=<<<SEU_NUMERO_WHATSAPP>>>
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  postgres_data:
  n8n_data:
ENDOFFILE
```

**Verificar se ficou certo:**
```bash
cat /home/ornato/whatsapp/docker-compose.yml
```
> Leia o arquivo e confirme que seu IP, sua chave e seu número estão corretos antes de continuar.

---

## PASSO 5 — Ligar Tudo

```bash
cd /home/ornato/whatsapp && docker-compose up -d
```

> Na primeira vez demora ~5 minutos (vai baixar os programas da internet).

**Verificar se está rodando:**
```bash
docker-compose ps
```

Deve aparecer 3 linhas com `Up`:
```
NAME                 STATUS
evolution_api        Up
evolution_postgres   Up
n8n                  Up
```

Se algum aparecer como `Exit`, veja a seção de problemas no final.

---

## PASSO 6 — Criar a Instância do WhatsApp

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{"instanceName": "ornato", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```

Deve aparecer `"instanceName":"ornato"` na resposta. ✓

---

## PASSO 7 — Conectar o WhatsApp (QR Code)

### Opção A — Via painel visual (mais fácil):

Abra no navegador do seu computador:
```
http://<<<IP_DO_VPS>>>:8080/manager
```
> Exemplo: `http://82.115.21.45:8080/manager`

- Quando pedir autenticação, use a chave: `ornato-evolution-key-2024`
- Clique na instância `ornato`
- O QR Code vai aparecer na tela

### Opção B — Via terminal:

```bash
curl -X GET http://localhost:8080/instance/connect/ornato \
  -H "apikey: ornato-evolution-key-2024"
```

A resposta vai ter um campo `"base64"`. Para transformar em imagem:
1. Acesse: **https://base64.guru/converter/decode/image**
2. Cole o conteúdo do campo `base64` (começa com `iVBOR...`)
3. Clique em **Decode Base64 to Image**
4. O QR Code vai aparecer

### Escanear no celular:

No celular com o **número dedicado** (chip de atendimento):
1. Abra o **WhatsApp**
2. Toque nos **3 pontinhos** (canto superior direito)
3. **Aparelhos conectados**
4. **Conectar um aparelho**
5. Aponte a câmera para o QR Code

> Você tem ~60 segundos. Se expirar, rode o comando da Opção B de novo.

### Confirmar que conectou:

```bash
curl -X GET http://localhost:8080/instance/fetchInstances \
  -H "apikey: ornato-evolution-key-2024"
```

Procure `"state":"open"` na resposta. ✓

---

## PASSO 8 — Transferir o Arquivo do Workflow para o Computador

O arquivo `n8n-workflow-ornato.json` está no seu Mac em:
```
/Users/madeira/SISTEMA NOVO/docs/n8n-workflow-ornato.json
```

Você precisa ter ele acessível para fazer upload no n8n. Ele já está no seu computador — só localize ele no Finder:
1. Abra o **Finder**
2. Aperte `Command + Shift + G`
3. Cole: `/Users/madeira/SISTEMA NOVO/docs/`
4. Você vai ver o arquivo `n8n-workflow-ornato.json`

---

## PASSO 9 — Importar o Workflow no n8n

### Acessar o painel do n8n:

No navegador, acesse:
```
http://<<<IP_DO_VPS>>>:5678
```
> Exemplo: `http://82.115.21.45:5678`

**Login:**
- Usuário: `admin`
- Senha: `ornato2024`

Na primeira vez vai pedir para criar uma conta — use qualquer e-mail e senha (é só para acesso local).

### Importar o workflow (passo a passo com cliques):

1. No menu lateral esquerdo, clique em **Workflows**
2. No canto superior direito, clique no botão **+ Add Workflow**
3. Uma tela em branco vai abrir
4. No canto superior direito desta tela, clique nos **três pontinhos** `...`
5. Clique em **Import from file**
6. Uma janela do explorador de arquivos vai abrir
7. Navegue até `/Users/madeira/SISTEMA NOVO/docs/`
8. Selecione o arquivo `n8n-workflow-ornato.json` e clique em **Abrir**
9. O workflow vai carregar — você vai ver vários blocos coloridos conectados por linhas

### Ativar o workflow:

No canto superior direito da tela do workflow, tem um botão escrito **Inactive** (cinza).
Clique nele — vai virar **Active** (verde). ✓

### Pegar a URL do Webhook:

1. Clique no primeiro bloco do workflow (chama **Receber Mensagem** ou **Webhook**)
2. Uma janela lateral vai abrir
3. Procure o campo **Webhook URL** — será algo assim:
   ```
   http://82.115.21.45:5678/webhook/whatsapp
   ```
4. Copie essa URL

---

## PASSO 10 — Conectar o WhatsApp ao n8n

Cole no terminal (substituindo `<<<IP_DO_VPS>>>` pelo seu IP real):

```bash
curl -X POST http://localhost:8080/webhook/set/ornato \
  -H "Content-Type: application/json" \
  -H "apikey: ornato-evolution-key-2024" \
  -d '{
    "url": "http://<<<IP_DO_VPS>>>:5678/webhook/whatsapp",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

Deve aparecer `"enabled":true` na resposta. ✓

---

## PASSO 11 — Testar se Funcionou

1. Pegue **outro celular** (diferente do número conectado)
2. Envie uma mensagem para o número dedicado
3. Aguarde ~5 segundos
4. A **Sofia** responde automaticamente ✓

Se a Sofia precisar chamar um humano, ela vai te mandar uma mensagem no **seu WhatsApp pessoal** avisando nome, número e mensagem do lead.

**Se não respondeu:**
```bash
docker logs n8n --tail=50
```

---

## PASSO 12 — Ver as Conversas em Tempo Real

No painel do n8n (`http://IP:5678`), clique em **Executions** no menu lateral.

Cada mensagem recebida vira uma execução. Clique em qualquer uma para ver:
- O que o cliente enviou
- O que a Sofia respondeu
- Se houve algum erro em alguma etapa

---

## Como Funciona na Prática

```
Cliente manda mensagem
        ↓
Sofia responde em ~5 segundos (simulando que está digitando)
        ↓
Se cliente quiser falar com humano (ou Sofia entender que precisa):
        ↓
Você recebe no seu WhatsApp pessoal:

  🔔 LEAD PARA ATENDIMENTO HUMANO
  Nome: João Silva
  Telefone: 5598991234567
  Última mensagem: "quanto custa uma cozinha completa?"
  Abra o WhatsApp para assumir o atendimento.
        ↓
Você abre o WhatsApp e continua a conversa de onde a Sofia parou
```

---

## Resumo Visual

```
[Celular do Cliente]
        ↓ mensagem
[WhatsApp — chip dedicado]
        ↓
[Evolution API] porta 8080
        ↓ webhook
[n8n] porta 5678
        ↓
[Claude API] nuvem Anthropic
        ↓ resposta
[Evolution API] → [WhatsApp] → [Cliente]

        ↓ quando precisar de humano
[Evolution API] → [Seu WhatsApp] → [Você assume]
```

---

## Dicionário Rápido

| Termo | O que é na prática |
|---|---|
| **VPS** | Computador remoto na Hostinger que fica ligado 24h |
| **SSH** | A "porta dos fundos" para acessar esse computador pelo terminal |
| **Docker** | Programa que organiza tudo em "caixinhas" separadas |
| **Container** | Uma dessas caixinhas (cada serviço tem a sua) |
| **Evolution API** | O conector que liga o WhatsApp ao sistema |
| **n8n** | O cérebro da automação — recebe, processa, responde |
| **Workflow** | O fluxo que você importou (os blocos coloridos) |
| **Webhook** | Um endereço que recebe avisos automáticos |
| **Handoff** | Quando a Sofia passa a conversa para você |

---

## Problemas Comuns e Soluções

### "Não consigo acessar http://IP:8080 nem http://IP:5678"
O firewall do servidor está bloqueando. Rode:
```bash
ufw allow 8080 && ufw allow 5678 && ufw allow 22
```

### "QR Code expirou antes de eu escanear"
Rode novamente o comando da Opção B do Passo 7. Novo QR gerado.

### "docker-compose: command not found"
```bash
apt install docker-compose-plugin -y
```
Depois use `docker compose` (com espaço) em vez de `docker-compose`.

### "Um container aparece como Exit ou Restarting"
```bash
docker-compose logs
```
Procure a linha com `Error`. Geralmente é valor errado no arquivo de configuração.

### "Sofia não responde nada"
```bash
docker logs n8n --tail=100
```
Procure:
- `401` → chave Anthropic inválida
- `Connection refused` → webhook mal configurado
- `getaddrinfo ENOTFOUND` → problema de rede no container

### "Não recebo notificação no meu WhatsApp"
Verifique o `OWNER_PHONE` no docker-compose.yml: deve ser `5598XXXXXXXXX` (só números, sem `+`, sem traços, sem espaços).

### "Preciso desconectar e reconectar o WhatsApp"
```bash
curl -X DELETE http://localhost:8080/instance/logout/ornato \
  -H "apikey: ornato-evolution-key-2024"
```
Depois volte ao Passo 7 para gerar novo QR Code.

---

## Todos os Links Necessários

> **Importante:** n8n e Evolution API **não precisam ser baixados manualmente** — o Docker faz isso automaticamente quando você rodar o Passo 5. Os links abaixo são para referência e caso queira explorar cada ferramenta.

---

### 1. Hostinger — Seu Servidor

| O que fazer | Link |
|---|---|
| Painel principal (ver IP, reboot, etc.) | https://hpanel.hostinger.com |
| Abrir ticket de suporte | https://support.hostinger.com |

---

### 2. Anthropic (Claude — a IA que responde)

| O que fazer | Link |
|---|---|
| Criar conta / fazer login | https://console.anthropic.com |
| Criar chave de API | https://console.anthropic.com/settings/api-keys |
| Configurar pagamento | https://console.anthropic.com/settings/billing |
| Ver uso e custos | https://console.anthropic.com/settings/usage |
| Documentação da API | https://docs.anthropic.com |

> Custo estimado para uma marcenaria pequena: **R$ 5–20/mês** dependendo do volume de conversas.

---

### 3. n8n — A Automação (o "maestro")

| O que fazer | Link |
|---|---|
| Site oficial | https://n8n.io |
| GitHub (código fonte) | https://github.com/n8n-io/n8n |
| Documentação oficial | https://docs.n8n.io |
| Imagem Docker (instalada automaticamente) | https://hub.docker.com/r/n8nio/n8n |
| Comunidade / fórum de ajuda | https://community.n8n.io |

> O n8n que você vai instalar é a versão **self-hosted** (roda no seu servidor, sem mensalidade).

---

### 4. Evolution API — O Conector do WhatsApp

| O que fazer | Link |
|---|---|
| Site oficial | https://evolution-api.com |
| GitHub (código fonte) | https://github.com/EvolutionAPI/evolution-api |
| Documentação oficial | https://doc.evolution-api.com |
| Imagem Docker (instalada automaticamente) | https://hub.docker.com/r/atendai/evolution-api |

> A Evolution API é **open source e gratuita**. Você hospeda no seu próprio servidor.

---

### 5. Docker — O Ambiente que Roda Tudo

| O que fazer | Link |
|---|---|
| Site oficial | https://www.docker.com |
| Documentação | https://docs.docker.com |
| Docker Hub (repositório de imagens) | https://hub.docker.com |

> O Docker é instalado automaticamente no Passo 2 com um único comando. Não precisa baixar nada manualmente.

---

### 6. Ferramentas de Apoio Durante o Setup

| Para que serve | Link |
|---|---|
| Visualizar QR Code em base64 | https://base64.guru/converter/decode/image |
| Testar comandos curl online (alternativa) | https://reqbin.com |
| Ver se uma porta está aberta no servidor | https://portchecker.co |

---

### 7. Painéis que Você Vai Acessar Depois de Instalar

| Serviço | Endereço (substitua pelo seu IP) |
|---|---|
| Painel Evolution API | `http://SEU_IP:8080/manager` |
| Painel n8n (workflows) | `http://SEU_IP:5678` |

---

## Checklist Final

- [ ] IP do VPS anotado
- [ ] Chave Anthropic criada e salva (`sk-ant-...`)
- [ ] Pagamento configurado na Anthropic
- [ ] Número pessoal anotado no formato `5598XXXXXXXXX`
- [ ] Docker instalado (`docker-compose --version` funciona)
- [ ] 3 containers rodando (`Up`)
- [ ] Instância `ornato` criada
- [ ] WhatsApp conectado (`"state":"open"`)
- [ ] Workflow importado e **ativo** (verde) no n8n
- [ ] Webhook registrado (Passo 10)
- [ ] Teste realizado — Sofia respondeu ✓
- [ ] Notificação de handoff chegando no WhatsApp pessoal ✓

---

*Travou em algum passo? Me diga exatamente em qual passo está e o que apareceu na tela.*
