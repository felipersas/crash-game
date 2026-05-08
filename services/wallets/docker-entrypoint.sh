#!/bin/sh
set -e

# Aguarda PostgreSQL ficar pronto
until PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -U "$DATABASE_USER" -d "postgres" -c '\q'; do
  echo "Waiting for PostgreSQL at $DATABASE_HOST:$DATABASE_PORT..."
  sleep 1
done

echo "PostgreSQL is ready!"

# Executa migrations (só roda as pendentes, idempotente)
echo "Running Prisma migrations..."
bunx prisma migrate deploy

echo "Starting Wallets service..."
exec "$@"
