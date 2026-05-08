#!/bin/sh
set -e

# Executa migrations (só roda as pendentes, idempotente)
echo "Running Prisma migrations..."
bunx prisma migrate deploy

echo "Starting Games service..."
exec "$@"
