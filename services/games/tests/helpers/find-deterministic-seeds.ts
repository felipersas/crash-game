/**
 * Find Deterministic Seeds for Testing
 *
 * This script brute-forces seed strings to find ones that produce
 * specific crash points. Run this to discover new test seeds.
 *
 * Usage: bun run tests/helpers/find-deterministic-seeds.ts
 */

import { CrashPoint } from '../../src/domain/value-objects/crash-point.value-object';
import { SeedChain } from '../../src/domain/value-objects/seed-chain.value-object';

interface SeedResult {
  seed: string;
  crashPoint: number;
}

/**
 * Chain size must match RoundLifecycleManager.onModuleInit() which calls
 * SeedChain.generate(1000). Using a different size produces a different
 * seeds[0] and therefore a completely different crash point.
 */
const CHAIN_SIZE = 1000;

/**
 * Find a seed that produces a crash point close to the target.
 */
async function findSeedForCrashPoint(
  targetCrashPoint: number,
  tolerance: number = 0.1,
  maxAttempts: number = 10000,
): Promise<SeedResult | null> {
  console.log(`\n🔍 Looking for crash point ~${targetCrashPoint.toFixed(2)}x (±${tolerance})`);

  for (let i = 0; i < maxAttempts; i++) {
    const seedString = `test-crash-${targetCrashPoint}-${i}`;
    const chain = await SeedChain.generateDeterministic(seedString, CHAIN_SIZE);
    const crashPoint = await CrashPoint.fromSeed(chain.getSeed());

    const diff = Math.abs(crashPoint.getValue() - targetCrashPoint);
    if (diff <= tolerance) {
      console.log(
        `✅ Found after ${i + 1} attempts: "${seedString}" → ${crashPoint.getValue().toFixed(2)}x`,
      );
      return { seed: seedString, crashPoint: crashPoint.getValue() };
    }
  }

  console.log(`❌ Not found after ${maxAttempts} attempts`);
  return null;
}

/**
 * Find multiple seeds at once.
 */
async function findAllSeeds(): Promise<void> {
  console.log('🎲 Finding deterministic seeds for E2E tests...\n');

  const targets = [
    { crash: 1.5, tolerance: 0.05, attempts: 5000 },
    { crash: 2.0, tolerance: 0.05, attempts: 5000 },
    { crash: 3.0, tolerance: 0.1, attempts: 5000 },
    { crash: 5.0, tolerance: 0.2, attempts: 5000 },
    { crash: 10.0, tolerance: 0.5, attempts: 5000 },
  ];

  const results: Record<string, SeedResult> = {};

  for (const target of targets) {
    const result = await findSeedForCrashPoint(target.crash, target.tolerance, target.attempts);
    if (result) {
      results[`crash-${target.crash}`] = result;
    }
  }

  console.log('\n📋 Results Summary:');
  console.log('='.repeat(60));
  for (const [key, result] of Object.entries(results)) {
    console.log(`${key.padEnd(15)} → "${result.seed}" → ${result.crashPoint.toFixed(2)}x`);
  }

  console.log('\n💡 Copy this to your test helper or docker-compose.yml:');
  console.log('# Deterministic seeds for E2E testing');
  for (const [key, result] of Object.entries(results)) {
    console.log(`# ${key}: DETERMINISTIC_SEED=${result.seed}`);
  }
}

// Run if executed directly
if (import.meta.main) {
  findAllSeeds().catch(console.error);
}

export { findSeedForCrashPoint };
