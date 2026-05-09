import { describe, test, expect, beforeEach } from 'bun:test';
import { GetMyBetsUseCase } from '../../../src/application/use-cases/get-my-bets.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money } from '@crash/domain';

function mockFn<T extends (...args: any[]) => any>(impl?: T): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void } {
  const fn: any = (...args: any[]) => fn._impl(...args);
  fn._impl = impl || (() => {});
  fn.mockReturnValue = (v: any) => { fn._impl = () => v; };
  fn.mockResolvedValue = (v: any) => { fn._impl = () => Promise.resolve(v); };
  return fn;
}

const PLAYER_ID = 'player-1';

// Helper to create a Bet via restore (persistence) with known state
function makeBet(overrides: {
  id?: string;
  roundId?: string;
  playerId?: string;
  amountCents?: bigint;
  status: BetStatus;
  cashOutMultiplier?: number | null;
  cashOutAmountCents?: bigint | null;
  cashedOutAt?: Date | null;
  createdAt?: Date;
}): Bet {
  return Bet.restore(
    overrides.id ?? crypto.randomUUID(),
    overrides.roundId ?? crypto.randomUUID(),
    overrides.playerId ?? PLAYER_ID,
    overrides.amountCents ?? 1000n, // $10.00
    overrides.status,
    overrides.cashOutMultiplier ?? null,
    overrides.cashOutAmountCents ?? null,
    overrides.cashedOutAt ?? null,
    overrides.createdAt,
  );
}

describe('GetMyBetsUseCase', () => {
  let useCase: GetMyBetsUseCase;
  let mockBetRepo: any;

  beforeEach(() => {
    mockBetRepo = {
      findByPlayerPaginated: mockFn(async () => []),
      countByPlayer: mockFn(async () => 0),
      findByPlayer: mockFn(async () => []),
    };
    useCase = new GetMyBetsUseCase(mockBetRepo);
  });

  test('Should return paginated bets for player', async () => {
    const bet1 = makeBet({ status: BetStatus.CASHED_OUT, cashOutMultiplier: 2.5, cashOutAmountCents: 2500n });
    const bet2 = makeBet({ status: BetStatus.LOST });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet1, bet2]);
    mockBetRepo.countByPlayer.mockResolvedValue(10);
    mockBetRepo.findByPlayer.mockResolvedValue([bet1, bet2]);

    const result = await useCase.execute({ playerId: PLAYER_ID, page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.page).toBe(1);
    expect(result.meta.total).toBe(10);
  });

  test('Should compute correct pagination metadata', async () => {
    mockBetRepo.findByPlayerPaginated.mockResolvedValue([]);
    mockBetRepo.countByPlayer.mockResolvedValue(45);
    mockBetRepo.findByPlayer.mockResolvedValue([]);

    const result = await useCase.execute({ playerId: PLAYER_ID, page: 2, limit: 20 });

    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(20);
    expect(result.meta.total).toBe(45);
    expect(result.meta.totalPages).toBe(3); // ceil(45/20) = 3
  });

  test('Should calculate profit for cashed out bets', async () => {
    const bet = makeBet({
      status: BetStatus.CASHED_OUT,
      cashOutMultiplier: 2.5,
      cashOutAmountCents: 2500n, // $25.00 payout on $10.00 bet
    });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet]);
    mockBetRepo.countByPlayer.mockResolvedValue(1);
    mockBetRepo.findByPlayer.mockResolvedValue([bet]);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data[0].profitCents).toBe(1500); // 2500 - 1000
  });

  test('Should calculate negative profit for lost bets', async () => {
    const bet = makeBet({ status: BetStatus.LOST });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet]);
    mockBetRepo.countByPlayer.mockResolvedValue(1);
    mockBetRepo.findByPlayer.mockResolvedValue([bet]);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data[0].profitCents).toBe(-1000); // lost entire bet
  });

  test('Should return zero profit for pending bets', async () => {
    const bet = makeBet({ status: BetStatus.PENDING });

    mockBetRepo.findByPlayerPaginated.mockResolvedValue([bet]);
    mockBetRepo.countByPlayer.mockResolvedValue(1);
    mockBetRepo.findByPlayer.mockResolvedValue([bet]);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data[0].profitCents).toBe(0);
  });

  test('Should compute correct summary (totalWagered, wins, losses, profit)', async () => {
    const cashedBet = makeBet({
      status: BetStatus.CASHED_OUT,
      amountCents: 1000n,
      cashOutMultiplier: 2.0,
      cashOutAmountCents: 2000n,
    });
    const lostBet = makeBet({ status: BetStatus.LOST, amountCents: 500n });
    const pendingBet = makeBet({ status: BetStatus.PENDING, amountCents: 300n });

    // findByPlayer returns ALL bets (for summary), paginated returns subset
    mockBetRepo.findByPlayerPaginated.mockResolvedValue([cashedBet, lostBet]);
    mockBetRepo.countByPlayer.mockResolvedValue(3);
    mockBetRepo.findByPlayer.mockResolvedValue([cashedBet, lostBet, pendingBet]);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.summary.totalWageredCents).toBe(1800); // 1000 + 500 + 300
    expect(result.summary.wins).toBe(1);
    expect(result.summary.losses).toBe(1);
    expect(result.summary.profitCents).toBe(500); // (2000-1000) + (-500) + 0
  });

  test('Should handle empty bet list', async () => {
    mockBetRepo.findByPlayerPaginated.mockResolvedValue([]);
    mockBetRepo.countByPlayer.mockResolvedValue(0);
    mockBetRepo.findByPlayer.mockResolvedValue([]);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.summary.totalWageredCents).toBe(0);
    expect(result.summary.wins).toBe(0);
    expect(result.summary.losses).toBe(0);
    expect(result.summary.profitCents).toBe(0);
  });

  test('Should use default pagination when not provided', async () => {
    mockBetRepo.findByPlayerPaginated.mockResolvedValue([]);
    mockBetRepo.countByPlayer.mockResolvedValue(0);
    mockBetRepo.findByPlayer.mockResolvedValue([]);

    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Default is page=1, limit=20
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
  });
});
