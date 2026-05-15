import { describe, test, expect, beforeEach } from 'bun:test';
import { GetCurrentRoundUseCase } from '../../../src/application/use-cases/get-current-round.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Money, PlayerId } from '@crash/domain';
import { RoundNotFoundError } from '../../../src/domain/errors/domain.errors';

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

describe('GetCurrentRoundUseCase', () => {
  let useCase: GetCurrentRoundUseCase;
  let mockRoundRepo: any;

  beforeEach(() => {
    mockRoundRepo = {
      findCurrentRound: mockFn(async () => null),
    };
    useCase = new GetCurrentRoundUseCase(mockRoundRepo);
  });

  test('Should return current round with status and multiplier', async () => {
    const round = await Round.create();

    mockRoundRepo.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({});

    expect(result.roundId).toBe(round.id);
    expect(result.status).toBe(RoundStatus.BETTING);
    expect(result.seedHash).toBeDefined();
    expect(typeof result.currentMultiplier).toBe('number');
    expect(result.bettingEndTime).toBeDefined();
    expect(result.startedAt).toBeNull();
    expect(result.crashedAt).toBeNull();
  });

  test('Should include bets when includeBets is true', async () => {
    const round = await Round.create();
    round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));
    round.placeBet(PlayerId.from('player-2'), 'Player Two', Money.fromDecimal('20.00'));

    mockRoundRepo.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({ includeBets: true });

    expect(result.bets).toHaveLength(2);
    expect(result.bets[0].id).toBeDefined();
    expect(result.bets[0].playerId).toBeDefined();
    expect(result.bets[0].amountCents).toBeDefined();
    expect(result.bets[0].amountDecimal).toBeDefined();
    expect(result.bets[0].status).toBe(BetStatus.PENDING);
  });

  test('Should exclude bets when includeBets is false', async () => {
    const round = await Round.create();
    round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));

    mockRoundRepo.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({ includeBets: false });

    expect(result.bets).toHaveLength(0);
  });

  test('Should exclude bets when includeBets is undefined', async () => {
    const round = await Round.create();
    round.placeBet(PlayerId.from('player-1'), 'Player One', Money.fromDecimal('10.00'));

    mockRoundRepo.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({});

    expect(result.bets).toHaveLength(0);
  });

  test('Should throw RoundNotFoundError when no current round', async () => {
    mockRoundRepo.findCurrentRound.mockResolvedValue(null);

    expect(useCase.execute({})).rejects.toThrow(RoundNotFoundError);
  });

  test('Should map bet output correctly with cash out data', async () => {
    const p1 = PlayerId.from('player-1');
    const round = await Round.create(undefined, 'test-crash-10.0');
    round.placeBet(p1, 'Player One', Money.fromDecimal('10.00'));
    const bet = round.getBetByPlayer(p1)!;
    bet.confirm();
    await round.startRound();
    // Use a modest multiplier safe for crash ~10x
    round.updateMultiplier(5);

    // Cash out the bet so it has cash out data
    round.cashOut(p1);

    mockRoundRepo.findCurrentRound.mockResolvedValue(round);

    const result = await useCase.execute({ includeBets: true });

    expect(result.bets).toHaveLength(1);
    const betOutput = result.bets[0];
    expect(betOutput.status).toBe(BetStatus.CASHED_OUT);
    expect(betOutput.cashOutMultiplier).not.toBeNull();
    expect(betOutput.cashOutMultiplier).toBeGreaterThan(1);
    expect(betOutput.cashOutAmountCents).not.toBeNull();
    expect(betOutput.cashedOutAt).not.toBeNull();
  });
});
