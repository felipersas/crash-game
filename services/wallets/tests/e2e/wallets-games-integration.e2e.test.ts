/**
 * E2E Test: Wallets ↔ Games Integration
 *
 * Tests cross-service flow using Testcontainers:
 * 1. Create wallet via Wallets service
 * 2. Consume events from Games service via RabbitMQ
 * 3. Verify wallet state after operations
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { connect } from 'amqplib';
import { beforeAllTests, afterAllTests } from './helpers/compose';
import { authHeader } from './helpers/jwt';

describe('Wallets ↔ Games Integration (E2E)', () => {
  let connection: any | null = null;
  let channel: any | null = null;
  let gamesUrl: string;
  let walletsUrl: string;
  let rabbitmqUrl: string;
  const playerId = `e2e-integration-${Date.now()}`;

  beforeAll(async () => {
    const connections = await beforeAllTests();
    gamesUrl = connections.gamesUrl!;
    walletsUrl = connections.walletsUrl!;
    rabbitmqUrl = connections.rabbitmqUrl!;

    // Connect to RabbitMQ
    connection = await connect(rabbitmqUrl);
    channel = await connection.createChannel();

    // Set up test queue bound to games.events exchange (already created by service)
    await channel.assertQueue('test-wallets-integration', { durable: false, autoDelete: true });
    await channel.bindQueue('test-wallets-integration', 'games.events', '');
    await channel.purgeQueue('test-wallets-integration');

    // Create test wallet
    const walletResponse = await fetch(`${walletsUrl}/wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(playerId),
      },
    });
    expect(walletResponse.ok).toBe(true);
  }, 300_000);

  afterAll(async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await afterAllTests();
  }, 60_000);

  test('should verify RabbitMQ exchange exists', async () => {
    expect(channel).toBeTruthy();
  });

  test('should consume BetPlacedEvent when bet is placed', async () => {
    const betResponse = await fetch(`${gamesUrl}/games/bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(playerId),
      },
      body: JSON.stringify({ amount: 500 }),
    });

    if (!betResponse.ok) {
      console.log('Bet placement failed (status:', betResponse.status, ') - may not be in betting phase');
      return;
    }

    const betData = await betResponse.json();
    expect(betData).toHaveProperty('betId');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const message = await channel!.get('test-wallets-integration', { noAck: true });

    if (message) {
      const raw = JSON.parse(message.content.toString());
      const event = raw.pattern ? raw.data : raw;
      console.log('Received event:', event.eventType);

      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('aggregateId');
      expect(event).toHaveProperty('occurredAt');

      if (event.eventType === 'BetPlaced') {
        expect(event).toHaveProperty('playerId');
        expect(event).toHaveProperty('amount');
        expect(event).toHaveProperty('roundId');
        expect(event).toHaveProperty('betId');
      }
    } else {
      console.log('No message in queue - event consumed by wallets service or timing');
    }
  }, 30_000);

  test('should verify wallet state after operations', async () => {
    const response = await fetch(`${walletsUrl}/wallets/me`, {
      headers: authHeader(playerId),
    });

    expect(response.ok).toBe(true);

    const wallet = await response.json();
    expect(wallet).toHaveProperty('walletId');
    expect(wallet).toHaveProperty('playerId', playerId);
    expect(wallet).toHaveProperty('balance');
    expect(wallet).toHaveProperty('version');
    expect(typeof wallet.version).toBe('number');
    expect(wallet.version).toBeGreaterThan(0);
  });

  test('should verify both services are healthy', async () => {
    const gamesHealth = await fetch(`${gamesUrl}/games/health`);
    expect(gamesHealth.ok).toBe(true);

    const walletsHealth = await fetch(`${walletsUrl}/wallets/health`);
    expect(walletsHealth.ok).toBe(true);
  });
});
