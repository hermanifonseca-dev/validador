# ==========================================
# Estágio 1: Build (TypeScript -> JavaScript)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci

# Copia código-fonte e compila
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ==========================================
# Estágio 2: Execução em Produção
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Instala apenas dependências de produção
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copia build compilado do estágio anterior
COPY --from=builder /app/dist ./dist

# Expõe a porta da aplicação
EXPOSE 3000

# Usuário não-root por segurança
USER node

# Inicia o servidor
CMD ["node", "dist/server.js"]
