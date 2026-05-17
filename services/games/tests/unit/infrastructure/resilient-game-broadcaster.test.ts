import { describe, test, expect, mock } from 'bun:test';
import { ResilientGameBroadcaster } from '@/infrastructure/websocket/resilient-game-broadcaster';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';

function createThrowingGateway(overrides: Partial<IGameBroadcaster> = {}): IGameBroadcaster {
  return {
    broadcastRoundStarted: mock(() => {}),
    broadcastBettingEnded: mock(() => {}),
    broadcastCrash: mock(() => {}),
    broadcastBetPlaced: mock(() => {}),
    broadcastBetConfirmed: mock(() => {}),
    broadcastBetCancelled: mock(() => {}),
    broadcastPlayerCashedOut: mock(() => {}),
    ...overrides,
  };
}

describe('ResilientGameBroadcaster', () => {
  test('should not throw when gateway throws on broadcastRoundStarted', () => {
    const gateway = createThrowingGateway({
      broadcastRoundStarted: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() => broadcaster.broadcastRoundStarted('round-1', 'hash', new Date())).not.toThrow();
  });

  test('should not throw when gateway throws on broadcastBetPlaced', () => {
    const gateway = createThrowingGateway({
      broadcastBetPlaced: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() =>
      broadcaster.broadcastBetPlaced('round-1', 'bet-1', 'player-1', 'Player', 100n),
    ).not.toThrow();
  });

  test('should not throw when gateway throws on broadcastBetConfirmed', () => {
    const gateway = createThrowingGateway({
      broadcastBetConfirmed: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() =>
      broadcaster.broadcastBetConfirmed('round-1', 'bet-1', 'player-1', 'Player', 100n),
    ).not.toThrow();
  });

  test('should not throw when gateway throws on broadcastBetCancelled', () => {
    const gateway = createThrowingGateway({
      broadcastBetCancelled: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() =>
      broadcaster.broadcastBetCancelled('round-1', 'bet-1', 'player-1', 'Player', 100n, 'reason'),
    ).not.toThrow();
  });

  test('should not throw when gateway throws on broadcastPlayerCashedOut', () => {
    const gateway = createThrowingGateway({
      broadcastPlayerCashedOut: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() =>
      broadcaster.broadcastPlayerCashedOut('round-1', 'bet-1', 'player-1', 'Player', 2.5, 250n),
    ).not.toThrow();
  });

  test('should not throw when gateway throws on broadcastBettingEnded', () => {
    const gateway = createThrowingGateway({
      broadcastBettingEnded: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() => broadcaster.broadcastBettingEnded('round-1')).not.toThrow();
  });

  test('should not throw when gateway throws on broadcastCrash', () => {
    const gateway = createThrowingGateway({
      broadcastCrash: mock(() => {
        throw new Error('WS error');
      }),
    });
    const broadcaster = new ResilientGameBroadcaster(gateway);

    expect(() => broadcaster.broadcastCrash('round-1', 2.5, 'seed')).not.toThrow();
  });

  test('should delegate to gateway when no error occurs', () => {
    const gateway = createThrowingGateway();
    const broadcaster = new ResilientGameBroadcaster(gateway);

    broadcaster.broadcastBetPlaced('round-1', 'bet-1', 'player-1', 'Player', 100n);
    broadcaster.broadcastCrash('round-1', 2.5, 'seed');

    expect(gateway.broadcastBetPlaced).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastCrash).toHaveBeenCalledTimes(1);
  });
});
