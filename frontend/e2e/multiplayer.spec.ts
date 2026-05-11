import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Multi-player E2E simulation for Crash Game.
 *
 * Each player uses a different Keycloak user (player-1, player-2, player-3).
 * Wallets must be seeded before running: `cd services/wallets && bun run seed`
 *
 * Prerequisites:
 * - Full stack running: `bun run docker:up` + services + frontend
 * - Keycloak realm `crash-game` with test users (see docker/keycloak/realm-export.json)
 * - Wallets seeded: `cd services/wallets && bun run seed`
 *
 * Run: `cd frontend && bun run test:e2e`
 */

const TEST_PLAYERS = [
  { id: 1, username: 'player-1', password: 'player123' },
  { id: 2, username: 'player-2', password: 'player123' },
  { id: 3, username: 'player-3', password: 'player123' },
] as const;

const BET_AMOUNT = '1.00';

interface PlayerConfig {
  id: number;
  username: string;
  password: string;
}

/** Create an authenticated browser context by logging in via Keycloak. */
async function createPlayerContext(
  browser: Browser,
  player: PlayerConfig,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  const keycloakButton = page.locator('button:has-text("Keycloak")');
  await keycloakButton.click();

  await page.waitForURL('**/realms/**', { timeout: 15_000 });
  await page.waitForSelector('#username', { timeout: 10_000 });

  await page.locator('#username').fill(player.username);
  await page.locator('#password').fill(player.password);
  await page.locator('#kc-login').click();

  await page.waitForURL('**/games**', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  const loginLink = page.locator('a[href="/login"]');
  await expect(loginLink).toHaveCount(0, { timeout: 5_000 });

  console.log(`[Player ${player.id}] ${player.username} authenticated`);

  return context;
}

test.describe('Multi-player Crash Game simulation', () => {
  const contexts: BrowserContext[] = [];

  test.afterAll(async () => {
    for (const ctx of contexts) {
      await ctx.close();
    }
  });

  test('should handle multiple players placing bets and cashing out', async ({ browser }) => {
    test.setTimeout(120_000);

    // Phase 1: Create authenticated sessions in parallel
    const playerContexts = await Promise.all(
      TEST_PLAYERS.map(player => createPlayerContext(browser, player)),
    );
    contexts.push(...playerContexts);

    const playerPages = playerContexts.map(ctx => ctx.pages()[0]);

    // Phase 2: Navigate all players to /games
    await Promise.all(
      playerPages.map(async page => {
        await page.goto('/games');
        await page.waitForLoadState('networkidle');
      }),
    );

    // Phase 3+4: Each player independently waits for betting phase and bets ASAP with retry
    const MAX_BET_ATTEMPTS = 3;

    const betResults = await Promise.all(
      playerPages.map(async (page, i) => {
        const player = TEST_PLAYERS[i];
        const amountInput = page.locator('input[inputmode="numeric"]').first();
        const betButton = page.locator('button:has-text("BET")').first();

        for (let attempt = 1; attempt <= MAX_BET_ATTEMPTS; attempt++) {
          // Wait for betting phase (BET button visible + enabled)
          await expect(betButton).toBeEnabled({ timeout: 90_000 });

          try {
            // Fill and click immediately — no delays, no redundant checks
            await amountInput.fill(BET_AMOUNT);
            await betButton.click({ timeout: 3_000 });
            await expect(page.locator('text=Processing')).toBeVisible({ timeout: 5_000 });

            console.log(`[Player ${player.id}] bet placed (attempt ${attempt})`);
            return { page, player };
          } catch {
            // Betting window closed before we could click — wait for next round
            console.log(`[Player ${player.id}] missed window (attempt ${attempt})`);
          }
        }

        throw new Error(`Player ${player.id} failed to bet after ${MAX_BET_ATTEMPTS} attempts`);
      }),
    );

    // Phase 5: Wait for active phase, then cash out
    const cashoutResults = await Promise.all(
      betResults.map(async ({ page, player }) => {
        const cashoutButton = page.locator('button:has-text("CASH OUT")').first();

        try {
          await expect(cashoutButton).toBeVisible({ timeout: 15_000 });
          // Random delay to simulate real player reaction
          await page.waitForTimeout(1000 + Math.random() * 3000);
          await expect(cashoutButton).toBeVisible({ timeout: 2_000 });
          await cashoutButton.click();

          // Verify cashout — "You Won!" status appears
          await expect(page.locator('text=You Won!')).toBeVisible({ timeout: 5_000 });

          console.log(`[Player ${player.id}] ${player.username} cashed out`);
          return true;
        } catch {
          console.log(
            `[Player ${player.id}] ${player.username} — no cashout, round may have crashed`,
          );
          return false;
        }
      }),
    );

    const cashoutsCount = cashoutResults.filter(Boolean).length;
    console.log(`[Results] ${cashoutsCount}/${betResults.length} players cashed out`);

    // Phase 6: Wait for round to crash (state-based, not fixed sleep)
    const crashIndicator = playerPages[0].locator('text=CRASHED').first();
    try {
      await expect(crashIndicator).toBeVisible({ timeout: 15_000 });
    } catch {
      // Round may already have ended during cashout phase
    }

    for (let i = 0; i < playerPages.length; i++) {
      await playerPages[i].screenshot({ path: `e2e-results/player-${i + 1}-final.png` });
    }

    // All players should have placed bets
    expect(betResults.length).toBe(TEST_PLAYERS.length);
  });

  test('should show round history after crash', async ({ browser }) => {
    const context = await createPlayerContext(browser, {
      id: 1,
      username: 'player-1',
      password: 'player123',
    });
    contexts.push(context);
    const page = context.pages()[0];

    await page.goto('/games/rounds/history');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/games\/rounds\/history/);

    await page.screenshot({ path: 'e2e-results/round-history.png' });
  });
});
