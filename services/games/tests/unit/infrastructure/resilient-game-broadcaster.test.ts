import { describe, test, expect, beforeEach } from 'bun:test';
import { ResilientGameBroadcaster } from '@/infrastructure/websocket/resilient-game-broadcaster';
import type {
  BetBroadcast,
  BetCancelledBroadcast,
  CrashBroadcast,
  IGameBroadcaster,
  PlayerCashedOutBroadcast,
  RoundStartedBroadcast,
} from '@/application/interfaces/game-broadcaster';
import { createMockBroadcaster } from '../../helpers/mocks';

const roundStarted: RoundStartedBroadcast = {
  roundId: 'round-1',
  seedHash: 'hash',
  bettingEndTime: new Date('2026-01-01T00:00:10Z'),
};
const crash: CrashBroadcast = { roundId: 'round-1', crashPoint: 2.5, seed: 'seed' };
const bet: BetBroadcast = {
  roundId: 'round-1',
  betId: 'bet-1',
  playerId: 'player-1',
  playerName: 'Player',
  amountCents: 100n,
};
const betCancelled: BetCancelledBroadcast = { ...bet, reason: 'Insufficient funds' };
const cashedOut: PlayerCashedOutBroadcast = {
  roundId: 'round-1',
  betId: 'bet-1',
  playerId: 'player-1',
  playerName: 'Player',
  multiplier: 2.5,
  payoutCents: 250n,
};

type Method = keyof IGameBroadcaster;

/** Every broadcaster method with the arguments it is called with. */
const CALLS: Array<[Method, unknown[]]> = [
  ['broadcastRoundStarted', [roundStarted]],
  ['broadcastBettingEnded', ['round-1']],
  ['broadcastMultiplierUpdate', ['round-1', 1.23]],
  ['broadcastCrash', [crash]],
  ['broadcastBetPlaced', [bet]],
  ['broadcastBetConfirmed', [bet]],
  ['broadcastBetCancelled', [betCancelled]],
  ['broadcastPlayerCashedOut', [cashedOut]],
];

function invoke(target: IGameBroadcaster, method: Method, args: unknown[]): void {
  (target[method] as (...a: unknown[]) => void)(...args);
}

describe('ResilientGameBroadcaster', () => {
  let gateway: ReturnType<typeof createMockBroadcaster>;
  let broadcaster: ResilientGameBroadcaster;

  beforeEach(() => {
    gateway = createMockBroadcaster();
    broadcaster = new ResilientGameBroadcaster(gateway);
    // Silence the error log produced by the swallowed failures
    (broadcaster as unknown as { logger: { error: () => void } }).logger.error = () => {};
  });

  for (const [method, args] of CALLS) {
    test(`${method} should delegate the payload to the gateway unchanged`, () => {
      invoke(broadcaster, method, args);

      expect(gateway[method].callCount).toBe(1);
      expect(gateway[method].calls[0]).toEqual(args as never);
    });

    test(`${method} should not throw when the gateway throws`, () => {
      gateway[method].mockImplementation(() => {
        throw new Error('WS error');
      });

      expect(() => invoke(broadcaster, method, args)).not.toThrow();
      expect(gateway[method].callCount).toBe(1);
    });
  }

  test('should log the failure with the broadcast label', () => {
    const logged: unknown[][] = [];
    (broadcaster as unknown as { logger: { error: (...a: unknown[]) => void } }).logger.error = (
      ...a
    ) => logged.push(a);
    const error = new Error('WS error');
    gateway.broadcastCrash.mockImplementation(() => {
      throw error;
    });

    broadcaster.broadcastCrash(crash);

    expect(logged).toEqual([['Failed to broadcast crash', error]]);
  });

  test('should keep broadcasting after a failure', () => {
    gateway.broadcastMultiplierUpdate.mockImplementation(() => {
      throw new Error('WS error');
    });

    broadcaster.broadcastMultiplierUpdate('round-1', 1.5);
    broadcaster.broadcastCrash(crash);

    expect(gateway.broadcastCrash.callCount).toBe(1);
  });
});
