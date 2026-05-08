# Estágio 1: Build
FROM node:20-alpine AS builder

# Prisma Client requer openssl no Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copia arquivos de configuração e a pasta prisma primeiro (para o postinstall funcionar)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instala todas as dependências (devDependencies necessárias para build)
# O script "postinstall: prisma generate" do package.json será executado com sucesso aqui.
RUN npm ci

# Copia o restante do código fonte
COPY . .

# Realiza o build do projeto (TypeScript -> dist)
RUN npm run build

# Estágio 2: Produção
FROM node:20-alpine AS runner

# Prisma Client requer openssl no Alpine
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Copia apenas o necessário para produção
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instala apenas dependências de produção
# O postinstall vai rodar de novo e compilar os binários necessários.
RUN npm ci --only=production && npm cache clean --force

# Copia a build do estágio anterior
COPY --from=builder /app/dist ./dist

# Configuração de segurança (usuário não-root)
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
USER appuser

EXPOSE 5000

# CMD executa o script modificado do package.json (prisma migrate deploy && node dist/server.js)
CMD ["npm", "start"]
