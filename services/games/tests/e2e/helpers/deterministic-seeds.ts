/**
 * Deterministic Seeds for E2E Testing
 *
 * Pre-computed seeds that produce specific crash points.
 * Use these for predictable, fast E2E tests.
 *
 * Usage in docker-compose.test.yml:
 *   environment:
 *     - DETERMINISTIC_SEED=test-crash-2-27  # Crashes at ~2x (fast test)
 *
 * Usage in code:
 *   process.env.DETERMINISTIC_SEED = 'test-crash-2-27';
 */

export interface TestSeed {
  name: string;
  seed: string;
  crashPoint: number;
  description: string;
}

/**
 * Pre-computed seeds for common crash points.
 *
 * These were found using find-deterministic-seeds.ts script.
 * The crash point may vary slightly due to floating point precision.
 */
export const DETERMINISTIC_SEEDS: TestSeed[] = [
  {
    name: 'fast-crash',
    seed: 'test-crash-1.5-6',
    crashPoint: 1.47,
    description: 'Fast crash (~1.5x) - ideal for quick smoke tests',
  },
  {
    name: 'low-crash',
    seed: 'test-crash-2-94',
    crashPoint: 1.98,
    description: 'Low crash (~2x) - fast but still playable',
  },
  {
    name: 'medium-crash',
    seed: 'test-crash-3-20',
    crashPoint: 3.02,
    description: 'Medium crash (~3x) - balanced test',
  },
  {
    name: 'high-crash',
    seed: 'test-crash-5-179',
    crashPoint: 5.1,
    description: 'High crash (~5x) - tests longer rounds',
  },
  {
    name: 'very-high-crash',
    seed: 'test-crash-10-31',
    crashPoint: 9.64,
    description: 'Very high crash (~10x) - stress test for long rounds',
  },
];

/**
 * Get a seed by name.
 */
export function getSeedByName(name: string): string | undefined {
  return DETERMINISTIC_SEEDS.find((s) => s.name === name)?.seed;
}

/**
 * Get the fastest crash seed for quick tests.
 */
export function getFastSeed(): string {
  return DETERMINISTIC_SEEDS[0].seed;
}

/**
 * Get all seed names.
 */
export function getSeedNames(): string[] {
  return DETERMINISTIC_SEEDS.map((s) => s.name);
}

/**
 * Print all available seeds.
 */
export function printSeeds(): void {
  console.log('📋 Available Deterministic Seeds:');
  console.log('='.repeat(70));
  for (const seed of DETERMINISTIC_SEEDS) {
    console.log(`${seed.name.padEnd(20)} → ${seed.crashPoint.toFixed(2)}x → ${seed.description}`);
  }
  console.log('='.repeat(70));
  console.log('\n💡 Usage: DETERMINISTIC_SEED=<seed-value>');
}
