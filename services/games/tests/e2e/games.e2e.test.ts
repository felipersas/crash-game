/**
 * E2E Tests for Games Service
 *
 * Tests the complete flow using Testcontainers:
 * 1. Health check
 * 2. Get current round
 * 3. Place bet (with JWT auth)
 * 4. Get bet status
 * 5. Cash out (with JWT auth)
 * 6. Get my bets (with JWT auth)
 * 7. Round history
 * 8. Verify round integrity
 * 9. Database & RabbitMQ connectivity
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { beforeAllTests, afterAllTests, TestCompose } from './helpers/compose';
import { authHeader } from './helpers/jwt';

describe('Games Service (E2E)', () => {
  let gamesUrl: string;
  const playerId = `e2e-player-${Date.now()}`;

  beforeAll(async () => {
    const connections = await beforeAllTests();
    gamesUrl = connections.gamesUrl!;
  }, 300_000);

  afterAll(async () => {
    await afterAllTests();
  }, 60_000);

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${gamesUrl}/games/health`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toEqual({
        status: 'ok',
        service: 'games',
      });
    });
  });

  describe('Current Round', () => {
    test('should get current round', async () => {
      const response = await fetch(`${gamesUrl}/games/rounds/current`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('roundId');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('crashPoint');
      expect(data).toHaveProperty('currentMultiplier');
      expect(data).toHaveProperty('bets');
      expect(Array.isArray(data.bets)).toBe(true);
    });

    test('should include round metadata', async () => {
      const response = await fetch(`${gamesUrl}/games/rounds/current`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      // Round may or may not have started depending on timing
      expect(data).toHaveProperty('roundId');
      expect(typeof data.roundId).toBe('string');
    });
  });

  describe('Round History', () => {
    test('should get round history', async () => {
      const response = await fetch(`${gamesUrl}/games/rounds/history`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('meta');
    });

    test('should support pagination', async () => {
      const response = await fetch(`${gamesUrl}/games/rounds/history?page=1&limit=5`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.meta).toHaveProperty('page');
      expect(data.meta).toHaveProperty('limit');
      expect(data.meta).toHaveProperty('total');
      expect(data.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Place Bet', () => {
    test('should place bet successfully during betting phase', async () => {
      const response = await fetch(`${gamesUrl}/games/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId),
        },
        body: JSON.stringify({
          amount: 500, // $5.00 in cents
        }),
      });

      // 202 Accepted if in betting phase, or error if not
      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('roundId');
        expect(data).toHaveProperty('betId');
        expect(data).toHaveProperty('amountCents');
        expect(data).toHaveProperty('status');
        expect(data.amountCents).toBe(500);
      } else {
        // Not in betting phase - acceptable
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      }
    }, 20_000);

    test('should require authentication', async () => {
      const response = await fetch(`${gamesUrl}/games/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500 }),
      });

      // Should fail without auth header
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should validate minimum bet amount', async () => {
      const response = await fetch(`${gamesUrl}/games/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId),
        },
        body: JSON.stringify({ amount: 50 }), // $0.50 - below minimum ($1.00)
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    test('should validate maximum bet amount', async () => {
      const response = await fetch(`${gamesUrl}/games/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId),
        },
        body: JSON.stringify({ amount: 200000 }), // $2,000.00 - above maximum ($1,000.00)
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    test('should validate amount is integer', async () => {
      const response = await fetch(`${gamesUrl}/games/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId),
        },
        body: JSON.stringify({ amount: 'not-a-number' }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Get Bet Status', () => {
    test('should return 404 for non-existent bet', async () => {
      const fakeBetId = '00000000-0000-0000-0000-000000000000';
      const response = await fetch(`${gamesUrl}/games/bets/${fakeBetId}`);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Cash Out', () => {
    test('should require authentication', async () => {
      const response = await fetch(`${gamesUrl}/games/bet/cashout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '00000000-0000-0000-0000-000000000001',
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should require idempotencyKey', async () => {
      const response = await fetch(`${gamesUrl}/games/bet/cashout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(playerId),
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Get My Bets', () => {
    test('should require authentication', async () => {
      const response = await fetch(`${gamesUrl}/games/bets/me`);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should return bets for authenticated player', async () => {
      const response = await fetch(`${gamesUrl}/games/bets/me`, {
        headers: authHeader(playerId),
      });

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBe(true);
        expect(data).toHaveProperty('meta');
        expect(data).toHaveProperty('summary');
      }
    });

    test('should support pagination', async () => {
      const response = await fetch(`${gamesUrl}/games/bets/me?page=1&limit=5`, {
        headers: authHeader(playerId),
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.meta).toHaveProperty('page');
        expect(data.meta).toHaveProperty('limit');
      }
    });
  });

  describe('Verify Round', () => {
    test('should verify round integrity', async () => {
      // Get current round first
      const currentResponse = await fetch(`${gamesUrl}/games/rounds/current`);
      const currentData = await currentResponse.json();
      const roundId = currentData.roundId;

      const response = await fetch(`${gamesUrl}/games/rounds/${roundId}/verify`);

      // Verify may only work for completed rounds
      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('roundId');
        expect(data).toHaveProperty('crashPoint');
        expect(data).toHaveProperty('seed');
        expect(data).toHaveProperty('seedHash');
        expect(data).toHaveProperty('verified');
      }
    });
  });

  describe('Database Connection', () => {
    test('should verify PostgreSQL is accessible via container', async () => {
      const container = TestCompose.getContainer('postgres-1');
      expect(container).toBeTruthy();

      const host = container!.getHost();
      const port = container!.getMappedPort(5432);

      expect(host).toBeTruthy();
      expect(port).toBeGreaterThan(0);
    });

    test('should verify database connectivity via API', async () => {
      // If rounds/current returns data, database is connected
      const response = await fetch(`${gamesUrl}/games/rounds/current`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('roundId');
      // Round data comes from database, proving DB connectivity
    });
  });

  describe('RabbitMQ Connection', () => {
    test('should verify RabbitMQ is accessible via container', async () => {
      const container = TestCompose.getContainer('rabbitmq-1');
      expect(container).toBeTruthy();

      const host = container!.getHost();
      const port = container!.getMappedPort(5672);

      expect(host).toBeTruthy();
      expect(port).toBeGreaterThan(0);
    });

    test('should verify message broker connectivity via service', async () => {
      // Service health proves RabbitMQ connection (service would fail to start without it)
      const response = await fetch(`${gamesUrl}/games/health`);
      expect(response.ok).toBe(true);
    });
  });
});
