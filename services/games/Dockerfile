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

# Gera Prisma Client do serviço de games
# (usa uma URL dummy só pra fase de generate)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
WORKDIR /app/services/games
RUN bunx prisma generate

# Copia e configura o script de entrypoint para migrations
COPY --chmod=755 services/games/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Config de runtime
ENV NODE_ENV=production
ENV PORT=4001

EXPOSE 4001

# Sobe o serviço usando TypeScript diretamente (Bun runtime compila sob demanda)
CMD ["bun", "run", "src/main.ts"]
