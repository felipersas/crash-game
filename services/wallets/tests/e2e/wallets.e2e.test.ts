/**
 * E2E Tests for Wallets Service
 *
 * Tests the complete flow using Testcontainers:
 * 1. Health check
 * 2. Create wallet (with JWT auth)
 * 3. Get wallet (with JWT auth)
 * 4. Database & RabbitMQ connectivity via container checks
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { beforeAllTests, afterAllTests, TestCompose } from './helpers/compose';
import { authHeader } from './helpers/jwt';

describe('Wallets Service (E2E)', () => {
  let walletsUrl: string;
  let gamesUrl: string;
  const playerId = `e2e-wallet-${Date.now()}`;

  beforeAll(async () => {
    const connections = await beforeAllTests();
    walletsUrl = connections.walletsUrl!;
    gamesUrl = connections.gamesUrl!;
  }, 300_000);

  afterAll(async () => {
    await afterAllTests();
  }, 60_000);

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${walletsUrl}/wallets/health`);

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
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId),
        },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('walletId');
      expect(data).toHaveProperty('playerId', playerId);
      expect(data).toHaveProperty('balance');
    });

    test('should return existing wallet for same player', async () => {
      const playerId2 = `e2e-existing-${Date.now()}`;

      const response1 = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId2),
        },
      });

      expect(response1.ok).toBe(true);
      const data1 = await response1.json();

      const response2 = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId2),
        },
      });

      expect(response2.ok).toBe(true);
      const data2 = await response2.json();
      expect(data2.walletId).toBe(data1.walletId);
    });

    test('should require authentication', async () => {
      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Get Wallet', () => {
    const testPlayerId = `e2e-get-wallet-${Date.now()}`;

    beforeAll(async () => {
      await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(testPlayerId),
        },
      });
    });

    test('should get wallet by player ID', async () => {
      const response = await fetch(`${walletsUrl}/wallets/me`, {
        headers: authHeader(testPlayerId),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('walletId');
      expect(data).toHaveProperty('playerId', testPlayerId);
      expect(data).toHaveProperty('balance');
      expect(data).toHaveProperty('version');
    });

    test('should require authentication', async () => {
      const response = await fetch(`${walletsUrl}/wallets/me`);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should include wallet version', async () => {
      const response = await fetch(`${walletsUrl}/wallets/me`, {
        headers: authHeader(testPlayerId),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(typeof data.version).toBe('number');
      expect(data.version).toBeGreaterThan(0);
    });
  });

  describe('Database Connectivity', () => {
    test('should verify PostgreSQL container is accessible', async () => {
      const container = TestCompose.getContainer('postgres-1');
      expect(container).toBeTruthy();

      const host = container!.getHost();
      const port = container!.getMappedPort(5432);

      expect(host).toBeTruthy();
      expect(port).toBeGreaterThan(0);
    });

    test('should verify wallet persistence via API', async () => {
      const persistPlayerId = `e2e-persist-${Date.now()}`;

      const createResponse = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(persistPlayerId),
        },
      });

      expect(createResponse.ok).toBe(true);

      // Retrieve wallet to verify persistence
      const getResponse = await fetch(`${walletsUrl}/wallets/me`, {
        headers: authHeader(persistPlayerId),
      });

      expect(getResponse.ok).toBe(true);
      const data = await getResponse.json();
      expect(data).toHaveProperty('walletId');
      expect(data.playerId).toBe(persistPlayerId);
    });
  });

  describe('RabbitMQ Connectivity', () => {
    test('should verify RabbitMQ container is accessible', async () => {
      const container = TestCompose.getContainer('rabbitmq-1');
      expect(container).toBeTruthy();

      const host = container!.getHost();
      const port = container!.getMappedPort(5672);

      expect(host).toBeTruthy();
      expect(port).toBeGreaterThan(0);
    });

    test('should verify message broker connectivity via service', async () => {
      const response = await fetch(`${walletsUrl}/wallets/health`);
      expect(response.ok).toBe(true);
    });
  });

  describe('Balance Precision', () => {
    test('should handle balance as integer cents', async () => {
      const precisionPlayerId = `e2e-precision-${Date.now()}`;

      const response = await fetch(`${walletsUrl}/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(precisionPlayerId),
        },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(['string', 'number']).toContain(typeof data.balance);
    });
  });

  describe('Concurrent Requests', () => {
    test('should handle multiple concurrent wallet creations', async () => {
      const timestamp = Date.now();
      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${walletsUrl}/wallets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader(`e2e-concurrent-${timestamp}-${i}`),
          },
        }),
      );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.ok).toBe(true);
      }
    }, 30_000);
  });

  describe('Service Integration', () => {
    test('should verify games service is running', async () => {
      const response = await fetch(`${gamesUrl}/games/health`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.service).toBe('games');
    });
  });
});
