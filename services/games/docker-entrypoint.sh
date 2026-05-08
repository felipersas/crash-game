#!/bin/sh
set -e

# Aguarda PostgreSQL ficar pronto (usando bun para verificar conexão)
echo "Waiting for PostgreSQL at $DATABASE_HOST:$DATABASE_PORT..."
until bun run -e "
  const client = new (require('pg').Client)({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  await client.end();
" 2>/dev/null; do
  sleep 1
done

echo "PostgreSQL is ready!"

# Executa migrations (só roda as pendentes, idempotente)
echo "Running Prisma migrations..."
bunx prisma migrate deploy

echo "Starting Games service..."
exec "$@"
