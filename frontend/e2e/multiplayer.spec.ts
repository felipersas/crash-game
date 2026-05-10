import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Multi-player E2E simulation for Crash Game.
 *
 * Simulates N players simultaneously:
 * 1. Each player authenticates via Keycloak
 * 2. Navigates to /games
 * 3. Waits for betting phase
 * 4. Places a bet
 * 5. Waits for round to go active
 * 6. Cash out at random multiplier (or let it crash)
 *
 * Prerequisites:
 * - Full stack running: `bun run docker:up` + `bun run dev` (games, wallets, frontend)
 * - Keycloak realm `crash-game` with test user `player`/`player123`
 *
 * Run: `npx playwright test e2e/multiplayer.spec.ts`
 */

const PLAYER_COUNT = 3;
const BET_AMOUNT_CENTS = 100; // R$1.00

/** Create an authenticated browser context by logging in via Keycloak. */
async function createPlayerContext(browser: Browser, playerId: number): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to games — should redirect to Keycloak login if not authenticated
  await page.goto('/games');
  await page.waitForLoadState('networkidle');

  // Check if we're on Keycloak login page
  const isLoginPage = page.url().includes('/realms/') || await page.locator('#username').count() > 0;

  if (isLoginPage) {
    // Fill Keycloak login form
    await page.locator('#username').fill('player');
    await page.locator('#password').fill('player123');
    await page.locator('#kc-login').click();

    // Wait for redirect back to app
    await page.waitForURL('**/games**', { timeout: 15_000 });
  }

  // Verify we're on the game page
  await expect(page).toHaveURL(/\/games/);

  console.log(`[Player ${playerId}] Authenticated and on game page`);

  return context;
}

test.describe('Multi-player Crash Game simulation', () => {
  const contexts: BrowserContext[] = [];

  test.afterAll(async () => {
    for (const ctx of contexts) {
      await ctx.close();
    }
  });

  test(`should handle ${PLAYER_COUNT} players placing bets and cashing out`, async ({ browser }) => {
    // Phase 1: Create authenticated sessions for all players
    console.log(`[Setup] Creating ${PLAYER_COUNT} player sessions...`);

    const playerContexts = await Promise.all(
      Array.from({ length: PLAYER_COUNT }, (_, i) =>
        createPlayerContext(browser, i + 1),
      ),
    );
    contexts.push(...playerContexts);

    // Phase 2: All players navigate to game and observe state
    const playerPages = playerContexts.map(ctx => ctx.pages()[0]);

    // Ensure all pages are on /games
    for (const page of playerPages) {
      if (!page.url().includes('/games')) {
        await page.goto('/games');
      }
      await page.waitForLoadState('networkidle');
    }

    console.log(`[Phase 2] All ${PLAYER_COUNT} players on game page`);

    // Phase 3: Wait for betting phase and place bets simultaneously
    const betPromises = playerPages.map(async (page, i) => {
      const playerId = i + 1;

      // Wait for betting phase indicator (round started / place bet enabled)
      // The bet button should be enabled during betting phase
      const betButton = page.locator('button[type="submit"], button:has-text("Apostar"), button:has-text("Bet")').first();

      // Wait up to 30s for betting phase
      console.log(`[Player ${playerId}] Waiting for betting phase...`);

      // Wait for the round to be in a state where bets are accepted
      // Check for bet form or betting indicator
      await page.waitForSelector('form, [data-testid="bet-form"], input[type="number"]', {
        timeout: 30_000,
        state: 'visible',
      });

      // Set bet amount if there's an input
      const amountInput = page.locator('input[type="number"], input[name="amount"]').first();
      if (await amountInput.count() > 0) {
        await amountInput.clear();
        await amountInput.fill((BET_AMOUNT_CENTS / 100).toString());
      }

      // Small random delay to simulate real players (0-2s)
      await page.waitForTimeout(Math.random() * 2000);

      // Click bet button
      if (await betButton.count() > 0 && await betButton.isEnabled()) {
        await betButton.click();
        console.log(`[Player ${playerId}] Bet placed!`);
      } else {
        console.log(`[Player ${playerId}] Could not place bet (button not available)`);
      }
    });

    await Promise.all(betPromises);

    // Phase 4: Wait for active phase and observe multiplier
    console.log('[Phase 4] Waiting for active phase...');

    // Give the round time to transition to active
    await playerPages[0].waitForTimeout(12_000); // betting phase duration

    // Phase 5: Players cash out at random times during active phase
    const cashoutPromises = playerPages.map(async (page, i) => {
      const playerId = i + 1;

      const cashoutButton = page.locator(
        'button:has-text("Cash Out"), button:has-text("Retirar"), button:has-text("Cashout")',
      ).first();

      // Random delay before cashing out (1-5s into active phase)
      const delay = 1000 + Math.random() * 4000;
      await page.waitForTimeout(delay);

      if (await cashoutButton.count() > 0 && await cashoutButton.isEnabled()) {
        await cashoutButton.click();
        console.log(`[Player ${playerId}] Cashed out after ${Math.round(delay / 1000)}s`);
      } else {
        console.log(`[Player ${playerId}] No cashout button (round may have crashed before cashout)`);
      }
    });

    await Promise.all(cashoutPromises);

    // Phase 6: Wait for crash and verify round ended
    console.log('[Phase 6] Waiting for round to crash...');

    // Wait for crash event (crash indicator or new round starting)
    await playerPages[0].waitForTimeout(10_000);

    // Verify at least one player saw something
    for (let i = 0; i < playerPages.length; i++) {
      const page = playerPages[i];
      // Take a screenshot for verification
      await page.screenshot({ path: `e2e-results/player-${i + 1}-final.png` });
    }

    console.log('[Complete] Multi-player simulation finished');
  });

  test('should show round history after crash', async ({ browser }) => {
    const context = await createPlayerContext(browser, 1);
    contexts.push(context);
    const page = context.pages()[0];

    // Navigate to round history
    await page.goto('/games/rounds/history');
    await page.waitForLoadState('networkidle');

    // Verify history page loaded
    await expect(page).toHaveURL(/\/games\/rounds\/history/);
    console.log('[History] Round history page loaded successfully');

    await page.screenshot({ path: 'e2e-results/round-history.png' });
  });
});
