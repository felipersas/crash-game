/**
 * Find Deterministic Seeds for Testing
 *
 * This script brute-forces seed strings to find ones that produce
 * specific crash points. Run this to discover new test seeds.
 *
 * Usage: bun run tests/helpers/find-deterministic-seeds.ts
 */

import { CrashPoint } from '../../src/domain/value-objects/crash-point.value-object';

interface SeedResult {
  seed: string;
  crashPoint: number;
}

/**
 * Generate a seed from a string using the same method as SeedChain.generateDeterministic()
 */
async function seedFromString(seedString: string): Promise<string> {
  const stringBytes = new TextEncoder().encode(seedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', stringBytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

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
    const seed = await seedFromString(seedString);
    const crashPoint = await CrashPoint.fromSeed(seed);

    const diff = Math.abs(crashPoint.getValue() - targetCrashPoint);
    if (diff <= tolerance) {
      console.log(`✅ Found after ${i + 1} attempts: "${seedString}" → ${crashPoint.getValue().toFixed(2)}x`);
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
    const result = await findSeedForCrashPoint(
      target.crash,
      target.tolerance,
      target.attempts,
    );
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
// @ts-ignore - Bun supports import.meta.main
if (import.meta.main) {
  findAllSeeds().catch(console.error);
}

export { seedFromString, findSeedForCrashPoint };
