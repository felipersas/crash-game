import { describe, test, expect, beforeEach } from 'bun:test';
import { CashOutUseCase } from '../../../src/application/use-cases/cash-out.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { type Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money } from '@crash/domain';
import {
  RoundNotFoundError,
  NoActiveBetError,
  InvalidIdempotencyKeyError,
} from '../../../src/domain/errors/domain.errors';

function mockFn<T extends (...args: any[]) => any>(
  impl?: T,
): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void; calls: any[] } {
  const calls: any[] = [];
  const fn: any = (...args: any[]) => {
    calls.push(args);
    return fn._impl(...args);
  };
  fn._impl = impl || (() => {});
  fn.calls = calls;
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const PLAYER_ID = 'player-1';
const PLAYER_NAME = 'Player One';

describe('CashOutUseCase', () => {
  let useCase: CashOutUseCase;
  let mockRoundRepo: any;
  let mockBetRepo: any;
  let mockEventPublisher: any;
  let mockLifecycleManager: any;
  let mockRedis: any;
  let mockGateway: any;
  let mockMetrics: any;

  // Use deterministic seed to guarantee a high crash point so updateMultiplier doesn't crash early
  async function createActiveRoundWithBet(): Promise<{ round: Round; bet: Bet }> {
    const orig = process.env.DETERMINISTIC_SEED;
    process.env.DETERMINISTIC_SEED = 'test-crash-10.0';
    try {
      const round = await Round.create();
      const amount = Money.fromDecimal('10.00');
      round.placeBet(PLAYER_ID, PLAYER_NAME, amount);

      const bet = round.getBetByPlayer(PLAYER_ID)!;
      bet.confirm();

      await round.startRound();
      // With test-crash-10.0, crash is around 10x, so multiplier 5 is safe
      round.updateMultiplier(5);

      return { round, bet };
    } finally {
      if (orig !== undefined) process.env.DETERMINISTIC_SEED = orig;
      else delete process.env.DETERMINISTIC_SEED;
    }
  }

  beforeEach(() => {
    mockRoundRepo = {
      findById: mockFn(async () => null),
      save: mockFn(async () => {}),
    };

    mockBetRepo = {
      findByPlayerAndRound: mockFn(async () => null),
      update: mockFn(async () => {}),
    };

    mockEventPublisher = {
      publishBatch: mockFn(async () => {}),
    };

    mockLifecycleManager = {
      getCurrentRound: mockFn(() => null),
    };

    mockRedis = {
      checkCashoutIdempotency: mockFn(async () => null),
      setCashoutIdempotency: mockFn(async () => true),
    };

    mockGateway = {
      broadcastPlayerCashedOut: mockFn(() => {}),
    };

    mockMetrics = {
      incrBet: mockFn(() => {}),
      incrPayout: mockFn(() => {}),
    };

    useCase = new CashOutUseCase(
      mockRoundRepo,
      mockBetRepo,
      mockEventPublisher,
      mockLifecycleManager,
      mockRedis,
      mockGateway,
      mockMetrics,
    );
  });

  test('Should cash out active bet at current multiplier', async () => {
    const { round, bet } = await createActiveRoundWithBet();
    const currentMultiplier = round.getCurrentMultiplier();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    const result = await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    expect(result.playerId).toBe(PLAYER_ID);
    expect(result.roundId).toBe(round.id);
    expect(result.cashOutMultiplier).toBe(currentMultiplier);
    expect(result.payoutCents).toBeGreaterThan(0n);
    expect(result.betId).toBe(bet.id);
  });

  test('Should return cached result for valid idempotency key', async () => {
    const cachedResult = {
      betId: 'bet-123',
      roundId: 'round-123',
      playerId: PLAYER_ID,
      cashOutMultiplier: 2.5,
      payoutCents: 2500,
      cashedOutAt: new Date().toISOString(),
    };

    mockRedis.checkCashoutIdempotency.mockResolvedValue(cachedResult);

    const result = await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    expect(result.betId).toBe('bet-123');
    expect(result.roundId).toBe('round-123');
    expect(result.cashOutMultiplier).toBe(2.5);
    expect(result.payoutCents).toBe(2500n);
    // Should NOT have called save since cached result was returned
    expect(mockRoundRepo.save.calls.length).toBe(0);
  });

  test('Should throw InvalidIdempotencyKeyError for mismatched playerId on cached result', async () => {
    const cachedResult = {
      betId: 'bet-123',
      roundId: 'round-123',
      playerId: 'different-player',
      cashOutMultiplier: 2.5,
      payoutCents: 2500,
      cashedOutAt: new Date().toISOString(),
    };

    mockRedis.checkCashoutIdempotency.mockResolvedValue(cachedResult);

    expect(
      useCase.execute({
        playerId: PLAYER_ID,
        idempotencyKey: VALID_UUID,
      }),
    ).rejects.toThrow(InvalidIdempotencyKeyError);
  });

  test('Should throw InvalidIdempotencyKeyError for invalid UUID format', async () => {
    expect(
      useCase.execute({
        playerId: PLAYER_ID,
        idempotencyKey: 'not-a-uuid',
      }),
    ).rejects.toThrow(InvalidIdempotencyKeyError);
  });

  test('Should use live round from LifecycleManager when ACTIVE', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    // findById should NOT have been called since lifecycle manager provided the round
    expect(mockRoundRepo.findById.calls.length).toBe(0);
  });

  test('Should fall back to repository when no live round', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    // LifecycleManager returns null
    mockLifecycleManager.getCurrentRound.mockReturnValue(null);
    // Provide round via roundId
    mockRoundRepo.findById.mockResolvedValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    const result = await useCase.execute({
      playerId: PLAYER_ID,
      roundId: round.id,
      idempotencyKey: VALID_UUID,
    });

    expect(result.roundId).toBe(round.id);
  });

  test('Should throw RoundNotFoundError when round not found', async () => {
    mockLifecycleManager.getCurrentRound.mockReturnValue(null);

    expect(
      useCase.execute({
        playerId: PLAYER_ID,
        idempotencyKey: VALID_UUID,
      }),
    ).rejects.toThrow(RoundNotFoundError);
  });

  test('Should throw NoActiveBetError when bet not found', async () => {
    const { round } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(null);

    expect(
      useCase.execute({
        playerId: PLAYER_ID,
        idempotencyKey: VALID_UUID,
      }),
    ).rejects.toThrow(NoActiveBetError);
  });

  test('Should persist updated bet status', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    const updatedBet = round.getBetByPlayer(PLAYER_ID);
    expect(updatedBet?.getStatus()).toBe(BetStatus.CASHED_OUT);
    // betRepository.update should have been called
    expect(mockBetRepo.update.calls.length).toBe(1);
  });

  test('Should store idempotency result in Redis', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    // setCashoutIdempotency should have been called
    expect(mockRedis.setCashoutIdempotency.calls.length).toBe(1);
  });

  test('Should publish events and broadcast via WebSocket', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    expect(mockEventPublisher.publishBatch.calls.length).toBe(1);
    expect(mockGateway.broadcastPlayerCashedOut.calls.length).toBe(1);
  });

  test('Should handle WebSocket broadcast failure gracefully', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);
    // Gateway throws - use mockReturnValue with a throwing function
    mockGateway.broadcastPlayerCashedOut = mockFn(() => {
      throw new Error('WebSocket error');
    });

    // Should NOT throw - error is caught internally
    const result = await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    expect(result.playerId).toBe(PLAYER_ID);
    expect(result.betId).toBe(bet.id);
  });
});
