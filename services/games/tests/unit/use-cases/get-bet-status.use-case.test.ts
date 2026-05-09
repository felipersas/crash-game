import { describe, test, expect, beforeEach } from 'bun:test';
import { GetBetStatusUseCase } from '../../../src/application/use-cases/get-bet-status.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money } from '@crash/domain';
import { Multiplier } from '../../../src/domain/value-objects/multiplier.value-object';
import { BetNotFoundError } from '../../../src/domain/errors/domain.errors';

// --- Mock helpers ---

function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn: any = (...args: any[]) => {
    fn.callCount++;
    return fn._impl(...args);
  };
  fn._impl = impl || (() => {});
  fn.callCount = 0;
  fn.mockReturnValue = (v: any) => { fn._impl = () => v; };
  fn.mockResolvedValue = (v: any) => { fn._impl = () => Promise.resolve(v); };
  return fn as T & { callCount: number; mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void };
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

describe('GetBetStatusUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let useCase: GetBetStatusUseCase;

  const roundId = 'round-999';
  const playerId = 'player-777';
  const amount = Money.fromDecimal('50.00');

  beforeEach(() => {
    betRepository = createMockBetRepository();
    useCase = new GetBetStatusUseCase(betRepository as any);
  });

  test('should return bet status for existing bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    betRepository.findById.mockResolvedValue(bet);

    const result = await useCase.execute({ betId: bet.id });

    expect(result.betId).toBe(bet.id);
    expect(result.roundId).toBe(roundId);
    expect(result.playerId).toBe(playerId);
    expect(result.amountCents).toBe(amount.toCents());
    expect(result.status).toBe(BetStatus.PENDING);
  });

  test('should throw BetNotFoundError when bet not found', async () => {
    betRepository.findById.mockResolvedValue(null);

    expect(
      useCase.execute({ betId: 'nonexistent-bet-id' }),
    ).rejects.toThrow(BetNotFoundError);
  });

  test('should include cash out data for cashed out bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    bet.confirm();
    const multiplier = Multiplier.fromValue(3.5);
    bet.cashOut(multiplier);

    betRepository.findById.mockResolvedValue(bet);

    const result = await useCase.execute({ betId: bet.id });

    expect(result.status).toBe(BetStatus.CASHED_OUT);
    expect(result.cashOutMultiplier).toBe(3.5);
    expect(result.payoutCents).toBeDefined();
    expect(result.payoutCents).not.toBeNull();
    expect(result.cashedOutAt).toBeInstanceOf(Date);
  });

  test('should include cancel reason for cancelled bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    bet.cancel('Insufficient funds');

    betRepository.findById.mockResolvedValue(bet);

    const result = await useCase.execute({ betId: bet.id });

    expect(result.status).toBe(BetStatus.CANCELLED);
    expect(result.cancelReason).toBe('Insufficient funds');
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
  });

  test('should return correct status for pending bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);

    betRepository.findById.mockResolvedValue(bet);

    const result = await useCase.execute({ betId: bet.id });

    expect(result.status).toBe(BetStatus.PENDING);
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
    expect(result.cancelReason).toBeNull();
  });

  test('should return correct status for active (confirmed) bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    bet.confirm();

    betRepository.findById.mockResolvedValue(bet);

    const result = await useCase.execute({ betId: bet.id });

    expect(result.status).toBe(BetStatus.ACTIVE);
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
    expect(result.cancelReason).toBeNull();
  });

  test('should return correct status for lost bet', async () => {
    const bet = Bet.create(roundId, playerId, amount);
    bet.confirm();
    bet.markAsLost();

    betRepository.findById.mockResolvedValue(bet);

    const result = await useCase.execute({ betId: bet.id });

    expect(result.status).toBe(BetStatus.LOST);
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
    expect(result.cancelReason).toBeNull();
  });
});
