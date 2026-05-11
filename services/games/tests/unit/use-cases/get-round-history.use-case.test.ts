import { describe, test, expect, beforeEach } from 'bun:test';
import { GetRoundHistoryUseCase } from '../../../src/application/use-cases/get-round-history.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money } from '@crash/domain';

function mockFn<T extends (...args: any[]) => any>(
  impl?: T,
): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void } {
  const fn: any = (...args: any[]) => fn._impl(...args);
  fn._impl = impl || (() => {});
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn;
}

// Create a real crashed round for history testing
async function createCrashedRound(bets: { playerId: string; playerName: string; amount: string }[]): Promise<Round> {
  const round = await Round.create();

  for (const b of bets) {
    round.placeBet(b.playerId, b.playerName, Money.fromDecimal(b.amount));
    round.getBetByPlayer(b.playerId)!.confirm();
  }

  await round.startRound();
  // Force crash by advancing multiplier to a very high value
  round.updateMultiplier(1000);

  return round;
}

describe('GetRoundHistoryUseCase', () => {
  let useCase: GetRoundHistoryUseCase;
  let mockRoundRepo: any;

  beforeEach(() => {
    mockRoundRepo = {
      findHistory: mockFn(async () => []),
      findHistoryCount: mockFn(async () => 0),
    };
    useCase = new GetRoundHistoryUseCase(mockRoundRepo);
  });

  test('Should return paginated round history', async () => {
    const round1 = await createCrashedRound([{ playerId: 'p1', playerName: 'Player 1', amount: '10.00' }]);
    const round2 = await createCrashedRound([{ playerId: 'p2', playerName: 'Player 2', amount: '20.00' }]);

    mockRoundRepo.findHistory.mockResolvedValue([round1, round2]);
    mockRoundRepo.findHistoryCount.mockResolvedValue(25);

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.page).toBe(1);
    expect(result.meta.total).toBe(25);
    expect(result.meta.totalPages).toBe(2); // ceil(25/20)
  });

  test('Should map rounds to summary with bet totals', async () => {
    const round = await createCrashedRound([
      { playerId: 'p1', playerName: 'Player 1', amount: '10.00' },
      { playerId: 'p2', playerName: 'Player 2', amount: '20.00' },
    ]);

    mockRoundRepo.findHistory.mockResolvedValue([round]);
    mockRoundRepo.findHistoryCount.mockResolvedValue(1);

    const result = await useCase.execute({});

    expect(result.data).toHaveLength(1);
    const summary = result.data[0];
    expect(summary.roundId).toBe(round.id);
    expect(summary.status).toBe(RoundStatus.CRASHED);
    expect(summary.crashPoint).not.toBeNull();
    expect(summary.startedAt).not.toBeNull();
    expect(summary.crashedAt).not.toBeNull();
    expect(summary.totalBets).toBe(2);
    expect(summary.totalWageredCents).toBe(3000); // 1000 + 2000
  });

  test('Should compute correct pagination metadata', async () => {
    mockRoundRepo.findHistory.mockResolvedValue([]);
    mockRoundRepo.findHistoryCount.mockResolvedValue(50);

    const result = await useCase.execute({ page: 3, limit: 10 });

    expect(result.meta.page).toBe(3);
    expect(result.meta.limit).toBe(10);
    expect(result.meta.total).toBe(50);
    expect(result.meta.totalPages).toBe(5); // ceil(50/10)
  });

  test('Should handle empty history', async () => {
    mockRoundRepo.findHistory.mockResolvedValue([]);
    mockRoundRepo.findHistoryCount.mockResolvedValue(0);

    const result = await useCase.execute({});

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });

  test('Should use default pagination when not provided', async () => {
    mockRoundRepo.findHistory.mockResolvedValue([]);
    mockRoundRepo.findHistoryCount.mockResolvedValue(0);

    const result = await useCase.execute({});

    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
  });
});
