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
 * - Full stack running: `bun run docker:up` + services + frontend
 * - Keycloak realm `crash-game` with test user `player`/`player123`
 *
 * Run: `npx playwright test e2e/multiplayer.spec.ts`
 */

const PLAYER_COUNT = 3;
const BET_AMOUNT = '1.00';

/** Create an authenticated browser context by logging in via Keycloak. */
async function createPlayerContext(browser: Browser, playerId: number): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 1: Navigate to login page directly
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Step 2: Click "Login with Keycloak" button on the login page
  const keycloakButton = page.locator('button:has-text("Keycloak")');
  await keycloakButton.click();

  // Step 3: Wait for Keycloak login page to load
  // Keycloak is at localhost:8080 — wait for its form
  await page.waitForURL('**/realms/**', { timeout: 15_000 });
  await page.waitForSelector('#username', { timeout: 10_000 });

  // Step 4: Fill Keycloak credentials
  await page.locator('#username').fill('player');
  await page.locator('#password').fill('player123');
  await page.locator('#kc-login').click();

  // Step 5: Wait for redirect back to app (NextAuth callback → /games)
  await page.waitForURL('**/games**', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  // Verify we're authenticated — balance should be visible, no "Login" link
  const loginLink = page.locator('a[href="/login"]');
  await expect(loginLink).toHaveCount(0, { timeout: 5_000 });

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
    // Phase 1: Create authenticated sessions sequentially (Keycloak may have issues with parallel logins)
    console.log(`[Setup] Creating ${PLAYER_COUNT} player sessions...`);

    const playerContexts: BrowserContext[] = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const ctx = await createPlayerContext(browser, i + 1);
      playerContexts.push(ctx);
    }
    contexts.push(...playerContexts);

    const playerPages = playerContexts.map(ctx => ctx.pages()[0]);

    // Phase 2: Ensure all pages are on /games and refreshed
    for (const page of playerPages) {
      await page.goto('/games');
      await page.waitForLoadState('networkidle');
    }

    console.log(`[Phase 2] All ${PLAYER_COUNT} players on game page`);

    // Phase 3: Wait for a new betting phase
    // The game cycles through rounds — wait for "BETTING" or "Next round" indicator
    // to disappear, then for a new betting phase to start
    console.log('[Phase 3] Waiting for betting phase...');

    // Wait for bet form to be enabled (input not disabled = betting phase + authenticated)
    for (let i = 0; i < playerPages.length; i++) {
      const page = playerPages[i];
      const amountInput = page.locator('input[type="number"], input[type="text"]').first();

      // Wait for input to become enabled (betting phase)
      await expect(amountInput).toBeEnabled({ timeout: 60_000 });
      console.log(`[Player ${i + 1}] Bet form is enabled`);
    }

    // Phase 4: Place bets simultaneously with random delays
    console.log('[Phase 4] Placing bets...');

    const betPromises = playerPages.map(async (page, i) => {
      const playerId = i + 1;

      // Small random delay to simulate real players (0-2s)
      await page.waitForTimeout(Math.random() * 2000);

      // Set bet amount
      const amountInput = page.locator('input[type="number"], input[type="text"]').first();
      await amountInput.clear();
      await amountInput.fill(BET_AMOUNT);

      // Click bet/submit button
      const betButton = page.locator('button[type="submit"]').first();
      if (await betButton.isVisible() && await betButton.isEnabled()) {
        await betButton.click();
        console.log(`[Player ${playerId}] Bet placed!`);
      } else {
        console.log(`[Player ${playerId}] Bet button not available — may have missed betting window`);
      }
    });

    await Promise.all(betPromises);

    // Phase 5: Wait for active phase (multiplier rising)
    console.log('[Phase 5] Waiting for active phase...');
    await playerPages[0].waitForTimeout(12_000);

    // Phase 6: Players cash out at random times
    console.log('[Phase 6] Attempting cash outs...');

    const cashoutPromises = playerPages.map(async (page, i) => {
      const playerId = i + 1;
      const delay = 1000 + Math.random() * 4000;
      await page.waitForTimeout(delay);

      const cashoutButton = page.locator(
        'button:has-text("Cash Out"), button:has-text("Retirar"), button:has-text("Cashout")',
      ).first();

      if (await cashoutButton.isVisible() && await cashoutButton.isEnabled()) {
        await cashoutButton.click();
        console.log(`[Player ${playerId}] Cashed out after ~${Math.round(delay / 1000)}s`);
      } else {
        console.log(`[Player ${playerId}] No cashout button — round may have crashed`);
      }
    });

    await Promise.all(cashoutPromises);

    // Phase 7: Wait for crash and take final screenshots
    console.log('[Phase 7] Waiting for round to end...');
    await playerPages[0].waitForTimeout(10_000);

    for (let i = 0; i < playerPages.length; i++) {
      await playerPages[i].screenshot({ path: `e2e-results/player-${i + 1}-final.png` });
    }

    console.log('[Complete] Multi-player simulation finished');
  });

  test('should show round history after crash', async ({ browser }) => {
    const context = await createPlayerContext(browser, 1);
    contexts.push(context);
    const page = context.pages()[0];

    await page.goto('/games/rounds/history');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/games\/rounds\/history/);
    console.log('[History] Round history page loaded successfully');

    await page.screenshot({ path: 'e2e-results/round-history.png' });
  });
});
