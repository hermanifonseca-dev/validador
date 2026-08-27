# 🚀 Agente de Confirmação & Validação de Prestação de Contas (GOV.BR / WAHA)

Microserviço autônomo de alta performance desenvolvido em **Node.js + TypeScript** para substituir o fluxo do n8n. O sistema realiza envio de relatórios em PDF, recebimento de documentos via WhatsApp (WAHA), auditoria inteligente e nativa de assinaturas do **GOV.BR / ITI / ICP-Brasil**, upload automático no **Supabase Storage** e atualização de status no banco de dados.

---

## 📑 Funcionalidades Principais

1. **📤 Envio de Prestação (`POST /webhook/prestacoes`)**:
   - Recebe dados do PolisHub (`nome`, `telefone`, `url`).
   - Normaliza o telefone brasileiro (DDD + 55).
   - Envia o arquivo PDF da prestação para o WhatsApp do colaborador.
   - Envia instruções detalhadas com link do assinador oficial GOV.BR (`https://assinador.iti.br`).

2. **❌ Notificação de Recusa (`POST/GET /webhook/recusa` ou `/webhook/Recusa`)**:
   - Disparado pelo PolisHub quando o financeiro reprova uma prestação.
   - Envia mensagem via WhatsApp informando o motivo da recusa e solicitando a correção.

3. **📥 Recebimento & Auditoria Infalível (`POST /webhook/receberpres`)**:
   - Webhook do WAHA (`message.any`).
   - Baixa o arquivo PDF descriptografado do WhatsApp.
   - **Validação de Assinatura GOV.BR em 3 Camadas**:
     - **Camada 1 (Parser de Texto)**: Busca pelo selo visual oficial `"Documento assinado digitalmente"`, `"gov.br"`, `"validar.iti.gov.br"` e nome do signatário.
     - **Camada 2 (Streams FlateDecode)**: Varre fluxos de dados internos do PDF descompactando buffers zlib.
     - **Camada 3 (Criptografia & IA Gemini)**: Valida metadados `/ByteRange`, `/Type /Sig`, PKCS#7 e auditoria visual via Google Gemini Vision.
   - **Se Assinado**:
     - Upload do PDF no Supabase Storage: `reembolso-prestacao/prestacao-assinada/viagem{id}_assinado.pdf`.
     - Atualização no PostgreSQL/Supabase: tabela `viagens` (`status_prestacao: "Pendente"`, `prestacao_assinada_url: ...`).
     - Mensagem de confirmação de sucesso enviada ao técnico.
   - **Se Não Assinado**:
     - Mensagem explicativa instruindo o técnico a assinar pelo GOV.BR e reenviar.

---

## 🛠️ Variáveis de Ambiente (`.env`)

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `PORT` | Porta HTTP da aplicação | `3000` |
| `WAHA_BASE_URL` | URL do servidor WAHA | `https://polis-waha.8vsz2a.easypanel.host` |
| `WAHA_API_KEY` | Chave de API do WAHA | `nx61dffeynfjswyv0vzt0vetfzyjtrnb` |
| `WAHA_SESSION` | Nome da sessão no WAHA | `PolisHub` |
| `GEMINI_API_KEY` | Chave de API do Google Gemini | `AIzaSy...` |
| `SUPABASE_URL` | URL do projeto Supabase | `https://oyzebaxjalhhttjlqdpk.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` do Supabase | `eyJhbGci...` |
| `SUPABASE_BUCKET` | Nome do bucket no Supabase Storage | `reembolso-prestacao` |

---

## 🚀 Como Subir no Easypanel (Passo a Passo)

### Opção 1: Implantação Direta via GitHub (Recomendado)

1. **Envie este repositório para o seu GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: microservico agente confirmacao gov.br"
   git remote add origin https://github.com/SEU_USUARIO/agente-confirmacao.git
   git push -u origin main
   ```

2. **No painel do Easypanel**:
   - Vá no seu projeto (ex: `polis` ou crie um novo projeto).
   - Clique em **+ New App** -> **App**.
   - Escolha **GitHub** e selecione o repositório `agente-confirmacao`.
   - Em **Build Type**, o Easypanel identificará automaticamente o `Dockerfile`.
   - Na aba **Environment Variables**, adicione as variáveis listadas na tabela acima.
   - Na aba **Domains**, adicione o domínio ou subdomínio público (ex: `agente-confirmacao.8vsz2a.easypanel.host`).
   - Clique em **Deploy**.

---

### Opção 2: Implantação via Docker Compose no Easypanel

1. No Easypanel, clique em **+ New App** -> **Compose**.
2. Cole o conteúdo do arquivo `docker-compose.yml`.
3. Preencha as variáveis de ambiente na aba **Environment Variables**.
4. Clique em **Deploy**.

---

## 🔗 Configuração dos Webhooks

### 1. No WAHA (WhatsApp)
Aponte o webhook da sessão `PolisHub` para a rota de recebimento do seu novo microserviço:
- **URL**: `https://seu-dominio.easypanel.host/webhook/receberpres`
- **Events**: `message.any`

### 2. No PolisHub (Frontend / Backend)
- **Envio de Prestação**: Mude de `https://polis-n8n.../webhook/prestacoes` para `https://seu-dominio.easypanel.host/webhook/prestacoes`
- **Recusa de Prestação**: Mude de `https://polis-n8n.../webhook/Recusa` para `https://seu-dominio.easypanel.host/webhook/recusa`

---

## 🧪 Testando Localmente

1. **Instale as dependências**:
   ```bash
   npm install
   ```

2. **Inicie em modo de desenvolvimento**:
   ```bash
   npm run dev
   ```

3. **Verifique a saúde da API**:
   Abra no navegador ou terminal:
   ```bash
   curl http://localhost:3000/health
   ```
