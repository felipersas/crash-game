import { describe, test, expect, beforeEach } from 'bun:test';
import { PlaceBetUseCase } from '../../../src/application/use-cases/place-bet.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import {
  Round,
  RoundStatus,
  DEFAULT_ROUND_CONFIG,
} from '../../../src/domain/entities/round.entity';
import { Money, PlayerId } from '@crash/domain';
import {
  BetNotFoundError,
  BetBelowMinimumError,
  BetAboveMaximumError,
  DuplicateBetError,
} from '../../../src/domain/errors/domain.errors';

// --- Mock helpers ---

function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn: any = (...args: any[]) => {
    fn.callCount++;
    return fn._impl(...args);
  };
  fn._impl = impl || (() => {});
  fn.callCount = 0;
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn as T & {
    callCount: number;
    mockReturnValue: (v: any) => void;
    mockResolvedValue: (v: any) => void;
  };
}

function createMockRoundRepository(overrides = {}) {
  return {
    findCurrentRound: mockFn(() => Promise.resolve(null)),
    create: mockFn(() => Promise.resolve()),
    save: mockFn(() => Promise.resolve()),
    findById: mockFn(() => Promise.resolve(null)),
    findHistory: mockFn(() => Promise.resolve([])),
    findHistoryCount: mockFn(() => Promise.resolve(0)),
    ...overrides,
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

function createMockPrisma() {
  return {
    $transaction: mockFn(async (fn: any) => {
      const tx = {
        outboxEvent: { create: mockFn(() => Promise.resolve()) },
        round: { create: mockFn(() => Promise.resolve()), update: mockFn(() => Promise.resolve()) },
        bet: { create: mockFn(() => Promise.resolve()), update: mockFn(() => Promise.resolve()) },
      };
      return fn(tx);
    }),
  };
}

function createMockOutboxWriter() {
  return {
    writeWithinTransaction: mockFn(() => Promise.resolve(['outbox-id-1'])),
    tryImmediatePublish: mockFn(() => Promise.resolve()),
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

describe('PlaceBetUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let eventPublisher: ReturnType<typeof createMockEventPublisher>;
  let gamesGateway: ReturnType<typeof createMockGamesGateway>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let outboxWriter: ReturnType<typeof createMockOutboxWriter>;
  let useCase: PlaceBetUseCase;

  const playerId = PlayerId.from('player-123');
  const playerName = 'Player 123';
  const validAmountCents = 1000n; // $10.00

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    betRepository = createMockBetRepository();
    eventPublisher = createMockEventPublisher();
    gamesGateway = createMockGamesGateway();
    metrics = createMockMetrics();
    prisma = createMockPrisma();
    outboxWriter = createMockOutboxWriter();
    useCase = new PlaceBetUseCase(
      roundRepository as any,
      betRepository as any,
      eventPublisher as any,
      gamesGateway as any,
      metrics as any,
      prisma as any,
      outboxWriter as any,
    );
  });

  test('should place bet on existing round', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(result.roundId).toBe(round.id);
    expect(result.betId).toBeDefined();
    expect(result.amountCents).toBe(validAmountCents);
    expect(result.status).toBe(RoundStatus.BETTING);
  });

  test('should create new round when no current round exists', async () => {
    roundRepository.findCurrentRound.mockResolvedValue(null);

    const result = await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(result.roundId).toBeDefined();
    expect(result.betId).toBeDefined();
    expect(roundRepository.create.callCount).toBe(1);
  });

  test('should persist bet independently', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(betRepository.create.callCount).toBe(1);
  });

  test('should write domain events to outbox', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(outboxWriter.writeWithinTransaction.callCount).toBe(1);
  });

  test('should write events for new round creation and bet placement to outbox', async () => {
    roundRepository.findCurrentRound.mockResolvedValue(null);

    await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(prisma.$transaction.callCount).toBe(2);
  });

  test('should broadcast via WebSocket', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(gamesGateway.broadcastBetPlaced.callCount).toBe(1);
  });

  test('should throw on invalid bet amount below minimum', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    const belowMinCents = 50n;

    expect(useCase.execute({ playerId, playerName, amountCents: belowMinCents })).rejects.toThrow(
      BetBelowMinimumError,
    );
  });

  test('should throw on invalid bet amount above maximum', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    const aboveMaxCents = 100_000_00n;

    expect(useCase.execute({ playerId, playerName, amountCents: aboveMaxCents })).rejects.toThrow(
      BetAboveMaximumError,
    );
  });

  test('should NOT save round when placing bet (bet is separate entity)', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(roundRepository.save.callCount).toBe(0);
  });

  test('should return output with correct fields', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

    expect(result).toHaveProperty('roundId');
    expect(result).toHaveProperty('betId');
    expect(result).toHaveProperty('amountCents');
    expect(result).toHaveProperty('status');
    expect(typeof result.roundId).toBe('string');
    expect(typeof result.betId).toBe('string');
    expect(typeof result.amountCents).toBe('bigint');
    expect(typeof result.status).toBe('string');
  });

  test('should pass autoCashOutMultiplier to bet', async () => {
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents();
    roundRepository.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({
      playerId,
      playerName,
      amountCents: validAmountCents,
      autoCashOutMultiplier: 2.5,
    });

    expect(result.roundId).toBe(round.id);
    expect(result.autoCashOutMultiplier).toBe(2.5);
  });

  describe('Bet replacement', () => {
    test('should handle bet replacement when player has PENDING bet', async () => {
      const round = await Round.create(DEFAULT_ROUND_CONFIG);
      round.pullEvents();
      round.placeBet(playerId, playerName, Money.fromDecimal('5.00'));
      roundRepository.findCurrentRound.mockResolvedValue(round);

      const result = await useCase.execute({ playerId, playerName, amountCents: validAmountCents });

      expect(betRepository.update.callCount).toBe(1);
      expect(betRepository.create.callCount).toBe(1);
      expect(result.amountCents).toBe(validAmountCents);
    });
  });
});
