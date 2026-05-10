import { describe, test, expect, beforeEach } from 'bun:test';
import { ConfirmBetUseCase } from '../../../src/application/use-cases/confirm-bet.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money } from '@crash/domain';
import { BetNotFoundError } from '../../../src/domain/errors/domain.errors';

// --- Mock helpers ---

function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn: any = (...args: any[]) => {
    fn.callCount++;
    fn.lastArgs = args;
    return fn._impl(...args);
  };
  fn._impl = impl || (() => {});
  fn.callCount = 0;
  fn.lastArgs = null;
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn as T & {
    callCount: number;
    lastArgs: any[] | null;
    mockReturnValue: (v: any) => void;
    mockResolvedValue: (v: any) => void;
  };
}

function createMockBetRepository(overrides = {}) {
  return {
    create: mockFn(() => Promise.resolve()),
    update: mockFn(() => Promise.resolve()),
    findById: mockFn(() => Promise.resolve(null)),
    findByRound: mockFn(() => Promise.resolve([])),
    findByPlayerAndRound: mockFn(() => Promise.resolve(null)),
    findByPlayer: mockFn(() => Promise.resolve([])),
    findByRoundAndStatus: mockFn(() => Promise.resolve([])),
    findByPlayerPaginated: mockFn(() => Promise.resolve([])),
    countByPlayer: mockFn(() => Promise.resolve(0)),
    ...overrides,
  };
}

function createMockEventPublisher() {
  return {
    publish: mockFn(() => Promise.resolve()),
    publishBatch: mockFn(() => Promise.resolve()),
    isConnected: mockFn(() => true),
  };
}

function createMockGamesGateway(overrides = {}) {
  return {
    broadcastBetPlaced: mockFn(() => {}),
    broadcastBetConfirmed: mockFn(() => {}),
    broadcastBetCancelled: mockFn(() => {}),
    broadcastPlayerCashedOut: mockFn(() => {}),
    broadcastRoundStarted: mockFn(() => {}),
    broadcastBettingEnded: mockFn(() => {}),
    broadcastMultiplierUpdate: mockFn(() => {}),
    broadcastCrash: mockFn(() => {}),
    ...overrides,
  };
}

describe('ConfirmBetUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let eventPublisher: ReturnType<typeof createMockEventPublisher>;
  let gamesGateway: ReturnType<typeof createMockGamesGateway>;
  let useCase: ConfirmBetUseCase;

  const roundId = 'round-123';
  const playerId = 'player-456';
  const amount = Money.fromDecimal('10.00');

  beforeEach(() => {
    betRepository = createMockBetRepository();
    eventPublisher = createMockEventPublisher();
    gamesGateway = createMockGamesGateway();
    useCase = new ConfirmBetUseCase(
      betRepository as any,
      eventPublisher as any,
      gamesGateway as any,
    );
  });

  test('should confirm pending bet (PENDING -> ACTIVE)', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    const result = await useCase.execute({
      roundId,
      betId: bet.id,
      playerId,
    });

    expect(result.betId).toBe(bet.id);
    expect(result.roundId).toBe(roundId);
    expect(result.playerId).toBe(playerId);
    // Verify the bet status changed to ACTIVE
    expect(bet.getStatus()).toBe(BetStatus.ACTIVE);
  });

  test('should throw BetNotFoundError when bet not found', async () => {
    betRepository.findByPlayerAndRound.mockResolvedValue(null);

    expect(useCase.execute({ roundId, betId: 'nonexistent', playerId })).rejects.toThrow(
      BetNotFoundError,
    );
  });

  test('should save confirmed bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(betRepository.update.callCount).toBe(1);
  });

  test('should emit BetConfirmedEvent', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(eventPublisher.publishBatch.callCount).toBe(1);
  });

  test('should broadcast via WebSocket', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(gamesGateway.broadcastBetConfirmed.callCount).toBe(1);
  });

  test('should handle WebSocket broadcast failure gracefully', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);
    gamesGateway.broadcastBetConfirmed = mockFn(() => {
      throw new Error('WS error');
    });

    const result = await useCase.execute({ roundId, betId: bet.id, playerId });

    // Should still succeed despite WS failure
    expect(result.betId).toBe(bet.id);
    expect(result.roundId).toBe(roundId);
    expect(result.playerId).toBe(playerId);
  });

  test('should pass correct data to WebSocket broadcast', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(gamesGateway.broadcastBetConfirmed.callCount).toBe(1);
    const args = gamesGateway.broadcastBetConfirmed.lastArgs;
    expect(args).not.toBeNull();
    expect(args![0]).toBe(roundId);
    expect(args![1]).toBe(bet.id);
    expect(args![2]).toBe(playerId);
    expect(args![3]).toBe(amount.toCents());
  });
});
