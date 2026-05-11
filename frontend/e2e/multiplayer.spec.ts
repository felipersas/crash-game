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
    // Phase 1: Create authenticated sessions sequentially
    const playerContexts: BrowserContext[] = [];
    for (const player of TEST_PLAYERS) {
      const ctx = await createPlayerContext(browser, player);
      playerContexts.push(ctx);
    }
    contexts.push(...playerContexts);

    const playerPages = playerContexts.map(ctx => ctx.pages()[0]);

    // Phase 2: Navigate all players to /games
    for (const page of playerPages) {
      await page.goto('/games');
      await page.waitForLoadState('networkidle');
    }

    // Phase 3: Wait for betting phase — input becomes enabled
    for (let i = 0; i < playerPages.length; i++) {
      const amountInput = playerPages[i].locator('input[inputmode="numeric"]').first();
      await expect(amountInput).toBeEnabled({ timeout: 60_000 });
    }

    // Phase 4: Place bets
    const betResults = await Promise.all(
      playerPages.map(async (page, i) => {
        const player = TEST_PLAYERS[i];

        // Stagger bets slightly (0-1s)
        await page.waitForTimeout(Math.random() * 1000);

        const amountInput = page.locator('input[inputmode="numeric"]').first();
        await amountInput.clear();
        await amountInput.fill(BET_AMOUNT);

        const betButton = page.locator('button:has-text("BET")').first();
        await expect(betButton).toBeVisible({ timeout: 5_000 });
        await expect(betButton).toBeEnabled({ timeout: 5_000 });
        await betButton.click();

        // BET button disappears when bet is accepted
        await expect(betButton).toBeHidden({ timeout: 5_000 });

        console.log(`[Player ${player.id}] ${player.username} bet placed`);
        return { page, player };
      }),
    );

    // Phase 5: Wait for active phase, then cash out
    const cashoutResults = await Promise.all(
      betResults.map(async ({ page, player }) => {
        const delay = 1000 + Math.random() * 4000;
        await page.waitForTimeout(delay);

        const cashoutButton = page.locator('button:has-text("CASH OUT")').first();

        try {
          await expect(cashoutButton).toBeVisible({ timeout: 8_000 });
          await cashoutButton.click();

          // Verify cashout — "You Won!" status appears
          await expect(page.locator('text=You Won!')).toBeVisible({ timeout: 5_000 });

          console.log(
            `[Player ${player.id}] ${player.username} cashed out after ~${Math.round(delay / 1000)}s`,
          );
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

    // Phase 6: Wait for round to end and take screenshots
    await playerPages[0].waitForTimeout(10_000);

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
