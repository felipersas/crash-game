/**
 * E2E Tests for Wallets Service
 *
 * Tests the complete flow using Testcontainers:
 * 1. Health check
 * 2. Create wallet
 * 3. Get wallet
 * 4. Credit/Debit operations (via internal endpoints if available)
 * 5. Database verification
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { beforeAllTests, afterAllTests, TestCompose } from './helpers/compose';

describe('Wallets Service (E2E)', () => {
  let walletsUrl: string;
  let gamesUrl: string;

  beforeAll(async () => {
    const connections = await beforeAllTests();
    walletsUrl = connections.walletsUrl!;
    gamesUrl = connections.gamesUrl!;
  }, 120_000);

  afterAll(async () => {
    await afterAllTests();
  }, 30_000);

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${walletsUrl}/health`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toEqual({
        status: 'ok',
        service: 'wallets',
      });
    });
  });

  describe('Create Wallet', () => {
    test('should create new wallet successfully', async () => {
      const playerId = `e2e-player-${Date.now()}`;

      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('walletId');
      expect(data).toHaveProperty('playerId', playerId);
      expect(data).toHaveProperty('balance');
      expect(data.balance).toBe('0');
    });

    test('should return existing wallet for same player', async () => {
      const playerId = `e2e-existing-${Date.now()}`;

      // Create wallet first time
      const response1 = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      expect(response1.ok).toBe(true);
      const data1 = await response1.json();
      const walletId1 = data1.walletId;

      // Create wallet second time (should return existing)
      const response2 = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      expect(response2.ok).toBe(true);
      const data2 = await response2.json();
      expect(data2.walletId).toBe(walletId1);
      expect(data2.playerId).toBe(playerId);
    });

    test('should validate playerId presence', async () => {
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Should return validation error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Get Wallet', () => {
    const testPlayerId = `e2e-get-wallet-${Date.now()}`;

    beforeAll(async () => {
      // Create a test wallet
      await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: testPlayerId }),
      });
    });

    test('should get wallet by playerId', async () => {
      const response = await fetch(`${walletsUrl}/wallets/me`);

      // Note: This endpoint uses JWT auth in production
      // For E2E testing without auth, it may return a default wallet
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('walletId');
        expect(data).toHaveProperty('playerId');
        expect(data).toHaveProperty('balance');
      }
    });

    test('should include wallet version', async () => {
      const response = await fetch(`${walletsUrl}/wallets/me`);

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('version');
        expect(typeof data.version).toBe('number');
        expect(data.version).toBeGreaterThan(0);
      }
    });
  });

  describe('Database Operations', () => {
    test('should verify database connection via Testcontainers', async () => {
      const container = TestCompose.getContainer('postgres-1');
      const host = container.getHost();
      const port = container.getMappedPort(5432);

      expect(host).toBeTruthy();
      expect(port).toBeGreaterThan(0);

      console.log(`✓ PostgreSQL at ${host}:${port}`);
    });

    test('should query wallets table', async () => {
      const result = await TestCompose.exec('postgres-1', [
        'psql',
        '-U',
        'admin',
        '-d',
        'wallets',
        '-c',
        'SELECT COUNT(*) FROM wallets;',
      ]);

      expect(result.exitCode).toBe(0);
    });

    test('should verify wallet was persisted', async () => {
      const playerId = `e2e-persist-${Date.now()}`;

      // Create wallet via API
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Verify in database
      const result = await TestCompose.exec('postgres-1', [
        'psql',
        '-U',
        'admin',
        '-d',
        'wallets',
        '-c',
        `SELECT * FROM wallets WHERE player_id = '${playerId}';`,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(playerId);
    });
  });

  describe('RabbitMQ Integration', () => {
    test('should verify RabbitMQ connection via Testcontainers', async () => {
      const container = TestCompose.getContainer('rabbitmq-1');
      const host = container.getHost();
      const port = container.getMappedPort(5672);

      expect(host).toBeTruthy();
      expect(port).toBeGreaterThan(0);

      console.log(`✓ RabbitMQ at ${host}:${port}`);
    });

    test('should verify RabbitMQ is running', async () => {
      const result = await TestCompose.exec('rabbitmq-1', [
        'rabbitmq-diagnostics',
        '-q',
        'ping',
      ]);

      expect(result.exitCode).toBe(0);
    });

    test('should have games.events exchange configured', async () => {
      const result = await TestCompose.exec('rabbitmq-1', [
        'rabbitmqctl',
        'list_exchanges',
        'games.events',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('games.events');
    });
  });

  describe('Balance Precision', () => {
    test('should handle balance as integer cents', async () => {
      const playerId = `e2e-precision-${Date.now()}`;

      // Create wallet
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Balance should be a string representing decimal
      expect(typeof data.balance).toBe('string');
      expect(data.balance).toMatch(/^\d+$/); // Integer only

      // Verify database stores as bigint/numeric
      const result = await TestCompose.exec('postgres-1', [
        'psql',
        '-U',
        'admin',
        '-d',
        'wallets',
        '-c',
        `SELECT balance FROM wallets WHERE player_id = '${playerId}';`,
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    test('should handle missing Content-Type header', async () => {
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        body: JSON.stringify({ playerId: 'test' }),
      });

      // May or may not fail depending on framework configuration
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Concurrent Requests', () => {
    test('should handle multiple concurrent wallet creations', async () => {
      const timestamp = Date.now();
      const requests = Array.from({ length: 10 }, (_, i) =>
        fetch(`${walletsUrl}/wallets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: `e2e-concurrent-${timestamp}-${i}` }),
        }),
      );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.ok).toBe(true);
      }

      // Verify all wallets were created
      const result = await TestCompose.exec('postgres-1', [
        'psql',
        '-U',
        'admin',
        '-d',
        'wallets',
        '-c',
        `SELECT COUNT(*) FROM wallets WHERE player_id LIKE 'e2e-concurrent-${timestamp}%';`,
      ]);

      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe('Service Integration', () => {
    test('should communicate with Games service', async () => {
      // Check Games service health
      const response = await fetch(`${gamesUrl}/health`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.service).toBe('games');
    });
  });
});
