/**
 * Prisma seed script — initializes wallets with balance for all test players.
 *
 * Usage:
 *   cd services/wallets && bun run seed
 *
 * Requires DATABASE_URL pointing to the wallets database.
 * For local dev: postgresql://admin:admin@localhost:5432/wallets
 *
 * Idempotent — safe to run multiple times (upsert).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const INITIAL_BALANCE_CENTS = 100_000n; // $1,000.00

// Must match docker/keycloak/realm-export.json user IDs
const TEST_PLAYERS = [
  { playerId: "00000000-0000-4000-8000-000000000001", username: "player" },
  { playerId: "00000000-0000-4000-8000-000000000002", username: "player-1" },
  { playerId: "00000000-0000-4000-8000-000000000003", username: "player-2" },
  { playerId: "00000000-0000-4000-8000-000000000004", username: "player-3" },
] as const;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding wallets...\n");

  for (const { playerId, username } of TEST_PLAYERS) {
    const wallet = await prisma.wallet.upsert({
      where: { playerId },
      update: { balanceCents: INITIAL_BALANCE_CENTS, version: 1 },
      create: {
        playerId,
        balanceCents: INITIAL_BALANCE_CENTS,
      },
    });

    const balance = Number(wallet.balanceCents) / 100;
    console.log(`  ${username} (${playerId}) → $${balance.toFixed(2)}`);
  }

  console.log(`\nDone. ${TEST_PLAYERS.length} wallets seeded.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
