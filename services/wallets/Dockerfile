FROM oven/bun:1.3.13

WORKDIR /app

# Copia arquivos da raiz do monorepo
COPY package.json bun.lock tsconfig.base.json ./

# Copia todos os workspaces necessários (packages + services)
COPY packages ./packages
COPY services ./services

# Instala dependências de TODOS os workspaces (games, wallets, packages/*, etc)
RUN bun install

# Build dos workspace packages
RUN cd packages/domain && bun run build
RUN cd packages/messaging && bun run build

# Gera Prisma Client do serviço de wallets
# (usa uma URL dummy só pra fase de generate)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
WORKDIR /app/services/wallets
RUN bunx prisma generate

# Build do serviço de wallets
RUN bun run build

# Config de runtime
ENV NODE_ENV=production
ENV PORT=4002

EXPOSE 4002

# Sobe o serviço a partir do workspace de wallets
# (main já vai estar em dist/main.js depois do build)
CMD ["bun", "run", "dist/main.js"]
