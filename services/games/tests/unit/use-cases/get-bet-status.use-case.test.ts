import { describe, test, expect, beforeEach } from 'bun:test';
import { BetId, Money, PlayerId, RoundId } from '@crash/domain';
import { GetBetStatusUseCase } from '../../../src/application/use-cases/get-bet-status.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Multiplier } from '../../../src/domain/value-objects/multiplier.value-object';
import { BetNotFoundError } from '../../../src/domain/errors/domain.errors';
import { createMockBetRepository } from '../../helpers/mocks';

describe('GetBetStatusUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let useCase: GetBetStatusUseCase;

  const roundId = RoundId.from('round-999');
  const playerId = PlayerId.from('player-777');
  const playerName = 'Player 777';
  const amount = Money.fromDecimal('50.00');

  function createBet(): Bet {
    return Bet.create(roundId, playerId, playerName, amount);
  }

  beforeEach(() => {
    betRepository = createMockBetRepository();
    useCase = new GetBetStatusUseCase(betRepository as any);
  });

  test('should return the status of an existing bet', async () => {
    // Arrange
    const bet = createBet();
    betRepository.findById.mockResolvedValue(bet);

    // Act
    const result = await useCase.execute({ betId: bet.id });

    // Assert
    expect(betRepository.findById.calls).toEqual([[bet.id]]);
    expect(result).toEqual({
      betId: bet.id,
      roundId,
      playerId,
      amountCents: 5000n,
      status: BetStatus.PENDING,
      cashOutMultiplier: null,
      payoutCents: null,
      cashedOutAt: null,
      cancelReason: null,
    });
  });

  test('should throw BetNotFoundError when the bet does not exist', async () => {
    // Arrange
    betRepository.findById.mockResolvedValue(null);

    // Act & Assert
    await expect(useCase.execute({ betId: BetId.from('nonexistent-bet-id') })).rejects.toThrow(
      BetNotFoundError,
    );
  });

  test('should include bigint cash out data for a cashed out bet', async () => {
    // Arrange
    const bet = createBet();
    bet.confirm();
    const payout = bet.cashOut(Multiplier.fromValue(3.5));
    betRepository.findById.mockResolvedValue(bet);

    // Act
    const result = await useCase.execute({ betId: bet.id });

    // Assert
    expect(result.status).toBe(BetStatus.CASHED_OUT);
    expect(result.cashOutMultiplier).toBe(3.5);
    expect(result.payoutCents).toBe(payout.toCents());
    expect(result.payoutCents).toBe(17500n);
    expect(result.cashedOutAt).toBeInstanceOf(Date);
    expect(result.cancelReason).toBeNull();
  });

  test('should include the cancel reason for a cancelled bet', async () => {
    // Arrange
    const bet = createBet();
    bet.cancel('Insufficient funds');
    betRepository.findById.mockResolvedValue(bet);

    // Act
    const result = await useCase.execute({ betId: bet.id });

    // Assert
    expect(result.status).toBe(BetStatus.CANCELLED);
    expect(result.cancelReason).toBe('Insufficient funds');
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
  });

  test('should return ACTIVE without cash out data for a confirmed bet', async () => {
    // Arrange
    const bet = createBet();
    bet.confirm();
    betRepository.findById.mockResolvedValue(bet);

    // Act
    const result = await useCase.execute({ betId: bet.id });

    // Assert
    expect(result.status).toBe(BetStatus.ACTIVE);
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
    expect(result.cancelReason).toBeNull();
  });

  test('should return LOST without cash out data for a lost bet', async () => {
    // Arrange
    const bet = createBet();
    bet.confirm();
    bet.markAsLost();
    betRepository.findById.mockResolvedValue(bet);

    // Act
    const result = await useCase.execute({ betId: bet.id });

    // Assert
    expect(result.status).toBe(BetStatus.LOST);
    expect(result.amountCents).toBe(5000n);
    expect(result.cashOutMultiplier).toBeNull();
    expect(result.payoutCents).toBeNull();
    expect(result.cashedOutAt).toBeNull();
    expect(result.cancelReason).toBeNull();
  });
});
