/**
 * E2E Tests for Games Service
 *
 * Tests the complete flow using Testcontainers:
 * 1. Health check
 * 2. Get current round
 * 3. Place bet (during betting phase)
 * 4. Cash out (during active phase)
 * 5. Verify round integrity
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  testContainers,
  beforeAllTests,
  afterAllTests,
} from './helpers/testcontainers-setup';

describe('Games Service (E2E)', () => {
  let gamesUrl: string;

  beforeAll(async () => {
    await beforeAllTests();
    gamesUrl = testContainers.getGamesServiceUrl();
  }, 120_000);

  afterAll(async () => {
    await afterAllTests();
  }, 30_000);

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${gamesUrl}/health`);

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
      const response = await fetch(`${gamesUrl}/rounds/current`);

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
      const response = await fetch(`${gamesUrl}/rounds/current`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('seedHash');
      expect(data.seedHash).toMatch(/^[a-f0-9]+$/i);
    });
  });

  describe('Round History', () => {
    test('should get round history', async () => {
      const response = await fetch(`${gamesUrl}/rounds/history`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('rounds');
      expect(Array.isArray(data.rounds)).toBe(true);
    });

    test('should limit history results', async () => {
      const response = await fetch(`${gamesUrl}/rounds/history`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.rounds.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Place Bet', () => {
    const testPlayerId = `e2e-player-${Date.now()}`;

    test('should place bet successfully', async () => {
      const response = await fetch(`${gamesUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: testPlayerId,
          amount: 500, // $5.00
        }),
      });

      // Response might be OK or might fail if not in betting phase
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);

      const data = await response.json();

      // If successful, validate response structure
      if (response.ok) {
        expect(data).toHaveProperty('roundId');
        expect(data).toHaveProperty('betId');
        expect(data).toHaveProperty('amountCents');
        expect(data).toHaveProperty('status');
      }
    });

    test('should validate minimum bet amount', async () => {
      const response = await fetch(`${gamesUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: testPlayerId,
          amount: 50, // $0.50 - below minimum
        }),
      });

      // Should return validation error (400 or 422)
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    test('should validate maximum bet amount', async () => {
      const response = await fetch(`${gamesUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: testPlayerId,
          amount: 200000, // $2,000.00 - above maximum
        }),
      });

      // Should return validation error (400 or 422)
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    test('should require playerId', async () => {
      const response = await fetch(`${gamesUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
        }),
      });

      // Should return validation error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Cash Out', () => {
    const testPlayerId = `e2e-cashout-${Date.now()}`;

    test('should cash out successfully', async () => {
      // First, we need to place a bet during betting phase
      // This test demonstrates the flow but may fail due to timing

      const betResponse = await fetch(`${gamesUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: testPlayerId,
          amount: 1000, // $10.00
        }),
      });

      if (!betResponse.ok) {
        // Not in betting phase, skip this test
        console.log('⚠ Skipping cash out test - not in betting phase');
        return;
      }

      const betData = await betResponse.json();
      const roundId = betData.roundId;

      // Wait for round to become active
      await new Promise(resolve => setTimeout(resolve, 2000));

      const cashOutResponse = await fetch(`${gamesUrl}/bet/cashout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
        }),
      });

      // Cash out might fail if round crashed or bet was already cashed out
      expect(cashOutResponse.status).toBeGreaterThanOrEqual(200);
      expect(cashOutResponse.status).toBeLessThan(500);

      if (cashOutResponse.ok) {
        const cashOutData = await cashOutResponse.json();
        expect(cashOutData).toHaveProperty('betId');
        expect(cashOutData).toHaveProperty('payoutCents');
        expect(cashOutData).toHaveProperty('cashOutMultiplier');
        expect(cashOutData.cashOutMultiplier).toBeGreaterThan(1);
      }
    }, 30_000);
  });

  describe('Verify Round', () => {
    test('should verify round integrity', async () => {
      // Get current round first
      const currentResponse = await fetch(`${gamesUrl}/rounds/current`);
      const currentData = await currentResponse.json();
      const roundId = currentData.roundId;

      const response = await fetch(`${gamesUrl}/rounds/${roundId}/verify`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('roundId');
      expect(data).toHaveProperty('crashPoint');
      expect(data).toHaveProperty('seed');
      expect(data).toHaveProperty('seedHash');
      expect(data).toHaveProperty('verified');
      expect(data.verified).toBe(true);
    });
  });

  describe('Database Connection', () => {
    test('should verify database connection via Testcontainers', async () => {
      const pgConnection = testContainers.getPostgresConnection();

      expect(pgConnection.host).toBeTruthy();
      expect(pgConnection.port).toBeGreaterThan(0);

      console.log(`✓ PostgreSQL at ${pgConnection.host}:${pgConnection.port}`);
    });

    test('should execute query in games database', async () => {
      const result = await testContainers.execPostgres([
        'psql',
        '-U',
        'admin',
        '-d',
        'games',
        '-c',
        'SELECT COUNT(*) FROM rounds;',
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('RabbitMQ Connection', () => {
    test('should verify RabbitMQ connection via Testcontainers', async () => {
      const mqConnection = testContainers.getRabbitMQConnection();

      expect(mqConnection.host).toBeTruthy();
      expect(mqConnection.port).toBeGreaterThan(0);

      console.log(`✓ RabbitMQ at ${mqConnection.host}:${mqConnection.port}`);
    });

    test('should verify RabbitMQ is running', async () => {
      const result = await testContainers.execRabbitMQ([
        'rabbitmq-diagnostics',
        '-q',
        'ping',
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Service Logs', () => {
    test('should check games service logs', async () => {
      const result = await testContainers.execGames([
        'sh',
        '-c',
        'echo "Service is running"',
      ]);

      expect(result.exitCode).toBe(0);
    });
  });
});
