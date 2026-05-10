#!/bin/sh
set -e

# Executa migrations (só roda as pendentes, idempotente)
echo "Running Prisma migrations..."
bunx prisma migrate deploy

echo "Seeding wallets..."
bun run prisma/seed.ts

echo "Starting Wallets service..."
exec "$@"
