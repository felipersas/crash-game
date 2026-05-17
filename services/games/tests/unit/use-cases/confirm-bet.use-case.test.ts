import { describe, test, expect, beforeEach } from 'bun:test';
import { ConfirmBetUseCase } from '../../../src/application/use-cases/confirm-bet.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money, RoundId, PlayerId, BetId } from '@crash/domain';
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

function createMockMetrics() {
  return {
    incrBet: mockFn(() => {}),
    incrPayout: mockFn(() => {}),
  };
}

function createMockPrisma() {
  return {
    $transaction: async (fn: any) => {
      const tx = {
        outboxEvent: { create: async () => {} },
        round: { create: async () => {}, update: async () => {} },
        bet: { create: async () => {}, update: async () => {} },
      };
      return fn(tx);
    },
  };
}

function createMockOutboxWriter() {
  return {
    writeWithinTransaction: mockFn(async () => ['outbox-id-1']),
    tryImmediatePublish: mockFn(async () => {}),
  };
}

function createMockAutoCashOutRepo() {
  return {
    addTarget: mockFn(() => Promise.resolve()),
    removeTarget: mockFn(() => Promise.resolve()),
    fetchAndRemoveEligible: mockFn(() => Promise.resolve([])),
    acquireLock: mockFn(() => Promise.resolve(true)),
    getCachedResult: mockFn(() => Promise.resolve(null)),
    cacheResult: mockFn(() => Promise.resolve()),
    clearRound: mockFn(() => Promise.resolve()),
  };
}

describe('ConfirmBetUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let gamesGateway: ReturnType<typeof createMockGamesGateway>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let outboxWriter: ReturnType<typeof createMockOutboxWriter>;
  let autoCashOutRepo: ReturnType<typeof createMockAutoCashOutRepo>;
  let useCase: ConfirmBetUseCase;

  const roundId = RoundId.from('round-123');
  const playerId = PlayerId.from('player-456');
  const playerName = 'Player 456';
  const amount = Money.fromDecimal('10.00');

  beforeEach(() => {
    betRepository = createMockBetRepository();
    gamesGateway = createMockGamesGateway();
    metrics = createMockMetrics();
    prisma = createMockPrisma();
    outboxWriter = createMockOutboxWriter();
    autoCashOutRepo = createMockAutoCashOutRepo();
    const roundStateProvider = {
      getCurrentRound: mockFn(() => null),
    };
    useCase = new ConfirmBetUseCase(
      betRepository as any,
      gamesGateway as any,
      metrics as any,
      prisma as any,
      outboxWriter as any,
      autoCashOutRepo as any,
      roundStateProvider as any,
    );
  });

  test('should confirm pending bet (PENDING -> ACTIVE)', async () => {
    const bet = Bet.create(roundId, playerId, playerName, amount);
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

    expect(
      useCase.execute({ roundId, betId: BetId.from('nonexistent'), playerId }),
    ).rejects.toThrow(BetNotFoundError);
  });

  test('should save confirmed bet', async () => {
    const bet = Bet.create(roundId, playerId, playerName, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(betRepository.update.callCount).toBe(1);
  });

  test('should emit BetConfirmedEvent', async () => {
    const bet = Bet.create(roundId, playerId, playerName, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(outboxWriter.writeWithinTransaction.callCount).toBe(1);
  });

  test('should broadcast via WebSocket', async () => {
    const bet = Bet.create(roundId, playerId, playerName, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(gamesGateway.broadcastBetConfirmed.callCount).toBe(1);
  });

  test('should pass correct data to WebSocket broadcast', async () => {
    const bet = Bet.create(roundId, playerId, playerName, amount);
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({ roundId, betId: bet.id, playerId });

    expect(gamesGateway.broadcastBetConfirmed.callCount).toBe(1);
    const args = gamesGateway.broadcastBetConfirmed.lastArgs;
    expect(args).not.toBeNull();
    // broadcastBetConfirmed(roundId, betId, playerId, playerName, amountCents)
    expect(args![0]).toBe(roundId);
    expect(args![1]).toBe(bet.id);
    expect(args![2]).toBe(playerId);
    expect(args![3]).toBe(playerName);
    expect(args![4]).toBe(amount.toCents());
  });

  test('should register auto cash-out target when bet has autoCashOutMultiplier', async () => {
    const bet = Bet.restore(
      'bet-1' as any,
      'round-1' as any,
      'player-1' as any,
      'Player',
      1000n,
      BetStatus.PENDING,
      2.5,
      null,
      null,
      null,
    );
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      roundId: 'round-1' as any,
      betId: 'bet-1' as any,
      playerId: 'player-1' as any,
    });

    expect(autoCashOutRepo.addTarget.callCount).toBe(1);
  });

  test('should NOT register auto cash-out target when bet has no autoCashOutMultiplier', async () => {
    const bet = Bet.restore(
      'bet-1' as any,
      'round-1' as any,
      'player-1' as any,
      'Player',
      1000n,
      BetStatus.PENDING,
      null,
      null,
      null,
      null,
    );
    betRepository.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      roundId: 'round-1' as any,
      betId: 'bet-1' as any,
      playerId: 'player-1' as any,
    });

    expect(autoCashOutRepo.addTarget.callCount).toBe(0);
  });
});
