import { describe, test, expect, beforeEach } from 'bun:test';
import { CashOutUseCase } from '../../../src/application/use-cases/cash-out.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { type Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money, InvalidIdempotencyKeyError, PlayerId } from '@crash/domain';
import { RoundNotFoundError, NoActiveBetError } from '../../../src/domain/errors/domain.errors';

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
const PLAYER_ID = PlayerId.from('player-1');
const PLAYER_NAME = 'Player One';

describe('CashOutUseCase', () => {
  let useCase: CashOutUseCase;
  let mockRoundRepo: any;
  let mockBetRepo: any;
  let mockEventPublisher: any;
  let mockLifecycleManager: any;
  let mockGateway: any;
  let mockMetrics: any;
  let mockPrisma: any;
  let mockOutboxWriter: any;

  // Use deterministic seed to guarantee a high crash point so updateMultiplier doesn't crash early
  async function createActiveRoundWithBet(): Promise<{ round: Round; bet: Bet }> {
    const round = await Round.create(undefined, 'test-crash-10.0');
    const amount = Money.fromDecimal('10.00');
    round.placeBet(PLAYER_ID, PLAYER_NAME, amount);

    const bet = round.getBetByPlayer(PLAYER_ID)!;
    bet.confirm();

    await round.startRound();
    // With test-crash-10.0, crash is around 10x, so multiplier 5 is safe
    round.updateMultiplier(5);

    return { round, bet };
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

    mockGateway = {
      broadcastPlayerCashedOut: mockFn(() => {}),
    };

    mockMetrics = {
      incrBet: mockFn(() => {}),
      incrPayout: mockFn(() => {}),
    };

    mockPrisma = {
      $transaction: mockFn(async (fn: any) => {
        const tx = {
          outboxEvent: { create: async () => {} },
          round: { create: async () => {}, update: async () => {} },
          bet: { create: async () => {}, update: async () => {} },
        };
        return fn(tx);
      }),
    };

    mockOutboxWriter = {
      writeWithinTransaction: mockFn(async () => ['outbox-id-1']),
      tryImmediatePublish: mockFn(async () => {}),
    };

    const mockAutoCashOutRepo = {
      removeTarget: mockFn(async () => {}),
    };

    useCase = new CashOutUseCase(
      mockRoundRepo,
      mockBetRepo,
      mockEventPublisher,
      mockLifecycleManager,
      mockGateway,
      mockMetrics,
      mockAutoCashOutRepo,
      mockPrisma as any,
      mockOutboxWriter as any,
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

  test('Should return existing result when bet is already cashed out (idempotency)', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    // Simulate the bet already being cashed out
    round.cashOut(PLAYER_ID);
    const cashedOutBet = round.getBetByPlayer(PLAYER_ID);

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(cashedOutBet);

    const result = await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    expect(result.betId).toBe(cashedOutBet.id);
    expect(result.roundId).toBe(round.id);
    // Should NOT have called update since bet was already cashed out
    expect(mockBetRepo.update.calls.length).toBe(0);
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

  test('Should publish events and broadcast via WebSocket', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    await useCase.execute({
      playerId: PLAYER_ID,
      idempotencyKey: VALID_UUID,
    });

    expect(mockOutboxWriter.writeWithinTransaction.calls.length).toBe(1);
    // Events are now published via outboxWriter within transaction
    expect(mockGateway.broadcastPlayerCashedOut.calls.length).toBe(1);
  });

  test('Should use override multiplier when targetMultiplier is provided', async () => {
    const { round, bet } = await createActiveRoundWithBet();

    mockLifecycleManager.getCurrentRound.mockReturnValue(round);
    mockBetRepo.findByPlayerAndRound.mockResolvedValue(bet);

    const result = await useCase.execute({
      playerId: PLAYER_ID,
      roundId: round.id,
      idempotencyKey: VALID_UUID,
      targetMultiplier: 2.0,
    });

    expect(result.cashOutMultiplier).toBe(2.0);
    expect(result.payoutCents).toBe(2000n);
  });
});
