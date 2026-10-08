import { describe, test, expect, beforeEach } from 'bun:test';
import { BetId, InvalidIdempotencyKeyError, Money, PlayerId, type RoundId } from '@crash/domain';
import { CashOutUseCase } from '../../../src/application/use-cases/cash-out.use-case';
import { Round } from '../../../src/domain/entities/round.entity';
import { Bet, BetStatus, type BetSnapshot } from '../../../src/domain/entities/bet.entity';
import { NoActiveBetError, RoundNotFoundError } from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockAutoCashOutRepository,
  createMockBetRepository,
  createMockBroadcaster,
  createMockMetrics,
  createMockRoundRepository,
  createMockRoundStateProvider,
  createMockUnitOfWork,
} from '../../helpers/mocks';

const VALID_KEY = '550e8400-e29b-41d4-a716-446655440000';
const PLAYER_ID = PlayerId.from('player-1');
const PLAYER_NAME = 'Player One';

/**
 * Deterministic seed with a high crash point (~10x) so updateMultiplier(5)
 * moves the round to ACTIVE without crashing it.
 */
async function createActiveRoundWithBet(): Promise<{ round: Round; bet: Bet }> {
  const round = await Round.create(undefined, 'test-crash-10.0');
  const bet = round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('10.00'));
  bet.confirm();
  await round.startRound();
  round.updateMultiplier(5);
  round.pullEvents();
  return { round, bet };
}

function restoreBet(roundId: RoundId, overrides: Partial<BetSnapshot> = {}): Bet {
  return Bet.restore({
    id: BetId.create(),
    roundId,
    playerId: PLAYER_ID,
    playerName: PLAYER_NAME,
    amountCents: 1000n,
    status: BetStatus.ACTIVE,
    autoCashOutMultiplier: null,
    cashOutMultiplier: null,
    cashOutAmount: null,
    cashedOutAt: null,
    cancelReason: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('CashOutUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let roundStateProvider: ReturnType<typeof createMockRoundStateProvider>;
  let autoCashOutRepository: ReturnType<typeof createMockAutoCashOutRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: CashOutUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    betRepository = createMockBetRepository();
    roundStateProvider = createMockRoundStateProvider();
    autoCashOutRepository = createMockAutoCashOutRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    metrics = createMockMetrics();
    useCase = new CashOutUseCase(
      roundRepository as never,
      betRepository as never,
      roundStateProvider as never,
      autoCashOutRepository as never,
      unitOfWork as never,
      broadcaster as never,
      metrics as never,
    );
  });

  describe('Happy path', () => {
    test('should cash out an active bet at the current multiplier', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      const currentMultiplier = round.getCurrentMultiplier();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(result).toEqual({
        betId: bet.id,
        roundId: round.id,
        playerId: PLAYER_ID,
        cashOutMultiplier: currentMultiplier,
        payoutCents: bet.getCashOutAmount()!.toCents(),
      });
      expect(result.payoutCents).toBeGreaterThan(1000n);
      expect(bet.getStatus()).toBe(BetStatus.CASHED_OUT);
    });

    test('should persist the bet and commit PlayerCashedOut in the unit of work', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(betRepository.update.calls).toEqual([[bet, FAKE_TX]]);
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0].aggregateId).toBe(round.id);
      const events = unitOfWork.committedEvents;
      expect(events.map((e) => e.eventType)).toEqual(['PlayerCashedOut']);
      expect(events[0]).toMatchObject({
        betId: bet.id,
        playerId: PLAYER_ID,
        betAmount: 1000n,
        cashOutMultiplier: result.cashOutMultiplier,
        winAmount: result.payoutCents,
      });
    });

    test('should broadcast the cash out and record metrics', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(broadcaster.broadcastPlayerCashedOut.calls[0][0]).toEqual({
        roundId: round.id,
        betId: bet.id,
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        multiplier: result.cashOutMultiplier,
        payoutCents: result.payoutCents,
      });
      expect(metrics.incrBet.calls).toEqual([['cashed_out', 1000]]);
      expect(metrics.incrPayout.calls).toEqual([[Number(result.payoutCents)]]);
    });

    test('should use the override multiplier when targetMultiplier is provided', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        roundId: round.id,
        idempotencyKey: VALID_KEY,
        targetMultiplier: 2.0,
      });

      // Assert
      expect(result.cashOutMultiplier).toBe(2.0);
      expect(result.payoutCents).toBe(2000n);
    });

    test('should sync the persisted bet into the live round before cashing out', async () => {
      // Arrange: live round has the bet as PENDING; the persisted copy is ACTIVE
      const round = await Round.create(undefined, 'test-crash-10.0');
      round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('10.00'));
      await round.startRound();
      round.updateMultiplier(5);
      round.pullEvents();
      const persistedBet = restoreBet(round.id);
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(persistedBet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(result.betId).toBe(persistedBet.id);
      expect(persistedBet.getStatus()).toBe(BetStatus.CASHED_OUT);
      expect(round.getBetByPlayer(PLAYER_ID)).toBe(persistedBet);
    });
  });

  describe('Round resolution', () => {
    test('should prefer the live ACTIVE round over the repository', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      await useCase.execute({ playerId: PLAYER_ID, roundId: round.id, idempotencyKey: VALID_KEY });

      // Assert
      expect(roundRepository.findById.callCount).toBe(0);
      expect(betRepository.findByPlayerAndRound.calls).toEqual([[PLAYER_ID, round.id]]);
    });

    test('should fall back to the repository when there is no live round', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(null);
      roundRepository.findById.mockResolvedValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        roundId: round.id,
        idempotencyKey: VALID_KEY,
      });

      // Assert
      expect(roundRepository.findById.calls).toEqual([[round.id]]);
      expect(result.roundId).toBe(round.id);
    });

    test('should fall back to the repository when the live round is not ACTIVE', async () => {
      // Arrange
      const liveRound = await Round.create();
      const { round, bet } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(liveRound);
      roundRepository.findById.mockResolvedValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        roundId: round.id,
        idempotencyKey: VALID_KEY,
      });

      // Assert
      expect(roundRepository.findById.callCount).toBe(1);
      expect(result.roundId).toBe(round.id);
    });

    test('should throw RoundNotFoundError when no round is found', async () => {
      // Arrange
      roundStateProvider.getCurrentRound.mockReturnValue(null);

      // Act & Assert
      await expect(
        useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY }),
      ).rejects.toThrow(RoundNotFoundError);
    });
  });

  describe('Validation', () => {
    test('should validate the idempotency key before loading anything', async () => {
      // Act & Assert
      await expect(
        useCase.execute({ playerId: PLAYER_ID, idempotencyKey: 'not-a-uuid' }),
      ).rejects.toThrow(InvalidIdempotencyKeyError);
      expect(roundStateProvider.getCurrentRound.callCount).toBe(0);
      expect(roundRepository.findById.callCount).toBe(0);
      expect(betRepository.findByPlayerAndRound.callCount).toBe(0);
    });

    test('should throw NoActiveBetError when the player has no bet', async () => {
      // Arrange
      const { round } = await createActiveRoundWithBet();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(null);

      // Act & Assert
      await expect(
        useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY }),
      ).rejects.toThrow(NoActiveBetError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });
  });

  describe('Idempotency', () => {
    test('should return the stored result for an already cashed-out bet without side effects', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      round.cashOut(PLAYER_ID);
      round.pullEvents();
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(result.betId).toBe(bet.id);
      expect(result.cashOutMultiplier).toBe(bet.getCashOutMultiplier()!.getValue());
      expect(result.payoutCents).toBe(bet.getCashOutAmount()!.toCents());
      expect(betRepository.update.callCount).toBe(0);
      expect(unitOfWork.commit.callCount).toBe(0);
      expect(autoCashOutRepository.removeTarget.callCount).toBe(0);
      expect(broadcaster.broadcastPlayerCashedOut.callCount).toBe(0);
      expect(metrics.incrPayout.callCount).toBe(0);
    });

    test('should return the stored cash-out multiplier, not the auto cash-out target (regression)', async () => {
      // Arrange: auto target 3.0x but the bet was actually cashed out at 2.0x
      const { round } = await createActiveRoundWithBet();
      const cashedOutBet = restoreBet(round.id, {
        status: BetStatus.CASHED_OUT,
        autoCashOutMultiplier: 3.0,
        cashOutMultiplier: 2.0,
        cashOutAmount: 2000n,
        cashedOutAt: new Date(),
      });
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(cashedOutBet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(result.cashOutMultiplier).toBe(2.0);
      expect(result.payoutCents).toBe(2000n);
      expect(result.betId).toBe(cashedOutBet.id);
    });
  });

  describe('Auto cash-out target', () => {
    test('should remove the auto cash-out target before persisting the cash out', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      const order: string[] = [];
      autoCashOutRepository.removeTarget.mockImplementation(async () => {
        await Promise.resolve();
        order.push('removeTarget');
      });
      betRepository.update.mockImplementation(async () => {
        order.push('update');
      });
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(autoCashOutRepository.removeTarget.calls).toEqual([[round.id, PLAYER_ID]]);
      expect(order).toEqual(['removeTarget', 'update']);
    });

    test('should still cash out when removing the auto cash-out target fails', async () => {
      // Arrange
      const { round, bet } = await createActiveRoundWithBet();
      autoCashOutRepository.removeTarget.mockRejectedValue(new Error('redis down'));
      roundStateProvider.getCurrentRound.mockReturnValue(round);
      betRepository.findByPlayerAndRound.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({ playerId: PLAYER_ID, idempotencyKey: VALID_KEY });

      // Assert
      expect(result.betId).toBe(bet.id);
      expect(bet.getStatus()).toBe(BetStatus.CASHED_OUT);
      expect(unitOfWork.commit.callCount).toBe(1);
      expect(broadcaster.broadcastPlayerCashedOut.callCount).toBe(1);
    });
  });
});
