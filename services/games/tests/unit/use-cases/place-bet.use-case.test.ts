import { describe, test, expect, beforeEach } from 'bun:test';
import { Money, PlayerId } from '@crash/domain';
import { PlaceBetUseCase } from '../../../src/application/use-cases/place-bet.use-case';
import { Bet, BetStatus } from '../../../src/domain/entities/bet.entity';
import { Round } from '../../../src/domain/entities/round.entity';
import {
  BetAboveMaximumError,
  BetBelowMinimumError,
  DuplicateBetError,
  InvalidAutoCashOutMultiplierError,
  RoundNotAcceptingBetsError,
  RoundNotFoundError,
} from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockBetRepository,
  createMockBroadcaster,
  createMockMetrics,
  createMockRoundRepository,
  createMockUnitOfWork,
} from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-123');
const PLAYER_NAME = 'Player 123';
const AMOUNT_CENTS = 1000n; // $10.00

async function createBettingRound(): Promise<Round> {
  const round = await Round.create();
  round.pullEvents(); // Clear creation events
  return round;
}

describe('PlaceBetUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: PlaceBetUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    betRepository = createMockBetRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    metrics = createMockMetrics();
    useCase = new PlaceBetUseCase(
      roundRepository as never,
      betRepository as never,
      unitOfWork as never,
      broadcaster as never,
      metrics as never,
    );
  });

  describe('Happy path', () => {
    test('should place a PENDING bet on the current round', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(result.roundId).toBe(round.id);
      expect(result.betId).toBeDefined();
      expect(result.amountCents).toBe(AMOUNT_CENTS);
      expect(result.status).toBe(BetStatus.PENDING);
      expect(result.autoCashOutMultiplier).toBeNull();
      expect(round.getBetByPlayer(PLAYER_ID)?.id).toBe(result.betId);
    });

    test('should persist the new bet within the unit of work transaction', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(betRepository.create.callCount).toBe(1);
      const [createdBet, tx] = betRepository.create.calls[0];
      expect((createdBet as Bet).id).toBe(result.betId);
      expect(tx).toBe(FAKE_TX);
      expect(betRepository.update.callCount).toBe(0);
      expect(roundRepository.save.callCount).toBe(0);
    });

    test('should commit a BetPlaced event for the round', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0].aggregateId).toBe(round.id);
      const events = unitOfWork.committedEvents;
      expect(events.map((e) => e.eventType)).toEqual(['BetPlaced']);
      expect(events[0]).toMatchObject({
        betId: result.betId,
        playerId: PLAYER_ID,
        amount: AMOUNT_CENTS,
      });
    });

    test('should broadcast the placed bet and record metrics', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(broadcaster.broadcastBetPlaced.callCount).toBe(1);
      expect(broadcaster.broadcastBetPlaced.calls[0][0]).toEqual({
        roundId: round.id,
        betId: result.betId,
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });
      expect(broadcaster.broadcastBetCancelled.callCount).toBe(0);
      expect(metrics.incrBet.calls).toEqual([['placed', 1000]]);
    });

    test('should pass autoCashOutMultiplier to the bet', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
        autoCashOutMultiplier: 2.5,
      });

      // Assert
      expect(result.autoCashOutMultiplier).toBe(2.5);
      expect(round.getBetByPlayer(PLAYER_ID)?.getAutoCashOutMultiplier()).toBe(2.5);
    });
  });

  describe('Validation', () => {
    test('should throw RoundNotFoundError when there is no current round (no round is created)', async () => {
      // Arrange
      roundRepository.findCurrentRound.mockResolvedValue(null);

      // Act & Assert
      await expect(
        useCase.execute({
          playerId: PLAYER_ID,
          playerName: PLAYER_NAME,
          amountCents: AMOUNT_CENTS,
        }),
      ).rejects.toThrow(RoundNotFoundError);
      expect(roundRepository.create.callCount).toBe(0);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw BetBelowMinimumError for amount below minimum', async () => {
      // Arrange
      roundRepository.findCurrentRound.mockResolvedValue(await createBettingRound());

      // Act & Assert
      await expect(
        useCase.execute({ playerId: PLAYER_ID, playerName: PLAYER_NAME, amountCents: 50n }),
      ).rejects.toThrow(BetBelowMinimumError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw BetAboveMaximumError for amount above maximum', async () => {
      // Arrange
      roundRepository.findCurrentRound.mockResolvedValue(await createBettingRound());

      // Act & Assert
      await expect(
        useCase.execute({ playerId: PLAYER_ID, playerName: PLAYER_NAME, amountCents: 100_000_00n }),
      ).rejects.toThrow(BetAboveMaximumError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw RoundNotAcceptingBetsError when round is not in BETTING phase', async () => {
      // Arrange
      const round = await Round.create(undefined, 'test-crash-10.0');
      await round.startRound();
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act & Assert
      await expect(
        useCase.execute({
          playerId: PLAYER_ID,
          playerName: PLAYER_NAME,
          amountCents: AMOUNT_CENTS,
        }),
      ).rejects.toThrow(RoundNotAcceptingBetsError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw DuplicateBetError when player already has an ACTIVE bet', async () => {
      // Arrange
      const round = await createBettingRound();
      round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('5.00')).confirm();
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act & Assert
      await expect(
        useCase.execute({
          playerId: PLAYER_ID,
          playerName: PLAYER_NAME,
          amountCents: AMOUNT_CENTS,
        }),
      ).rejects.toThrow(DuplicateBetError);
      expect(unitOfWork.commit.callCount).toBe(0);
      expect(broadcaster.broadcastBetPlaced.callCount).toBe(0);
    });

    test('should not cancel an existing PENDING bet when the new bet is invalid', async () => {
      // Arrange
      const round = await createBettingRound();
      const existing = round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('5.00'));
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act & Assert
      await expect(
        useCase.execute({
          playerId: PLAYER_ID,
          playerName: PLAYER_NAME,
          amountCents: AMOUNT_CENTS,
          autoCashOutMultiplier: 0.5,
        }),
      ).rejects.toThrow(InvalidAutoCashOutMultiplierError);
      expect(existing.getStatus()).toBe(BetStatus.PENDING);
      expect(unitOfWork.commit.callCount).toBe(0);
    });
  });

  describe('Bet replacement', () => {
    test('should cancel and persist a replaced PENDING bet in the same transaction', async () => {
      // Arrange
      const round = await createBettingRound();
      const previous = round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('5.00'));
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(previous.getStatus()).toBe(BetStatus.CANCELLED);
      expect(betRepository.update.calls).toEqual([[previous, FAKE_TX]]);
      expect(betRepository.create.callCount).toBe(1);
      expect((betRepository.create.calls[0][0] as Bet).id).toBe(result.betId);
      expect(result.betId).not.toBe(previous.id);
      expect(result.amountCents).toBe(AMOUNT_CENTS);
    });

    test('should commit BetCancelled for the replaced bet before BetPlaced (regression)', async () => {
      // Arrange
      const round = await createBettingRound();
      const previous = round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('5.00'));
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(unitOfWork.commits).toHaveLength(1);
      const events = unitOfWork.committedEvents;
      expect(events.map((e) => e.eventType)).toEqual(['BetCancelled', 'BetPlaced']);
      expect(events[0]).toMatchObject({ betId: previous.id, amount: 500n });
      expect(events[1]).toMatchObject({ betId: result.betId, amount: AMOUNT_CENTS });
    });

    test('should broadcast cancellation of the replaced bet and record metrics', async () => {
      // Arrange
      const round = await createBettingRound();
      const previous = round.placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('5.00'));
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(broadcaster.broadcastBetCancelled.calls[0][0]).toEqual({
        roundId: round.id,
        betId: previous.id,
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: 500n,
        reason: 'Replaced by new bet attempt',
      });
      expect(broadcaster.broadcastBetPlaced.callCount).toBe(1);
      expect(metrics.incrBet.calls).toEqual([
        ['cancelled', 500],
        ['placed', 1000],
      ]);
    });

    test('should place a new bet over a CANCELLED one without updating it', async () => {
      // Arrange
      const round = await createBettingRound();
      round
        .placeBet(PLAYER_ID, PLAYER_NAME, Money.fromDecimal('5.00'))
        .cancel('Insufficient funds');
      round.pullEvents();
      roundRepository.findCurrentRound.mockResolvedValue(round);

      // Act
      const result = await useCase.execute({
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: AMOUNT_CENTS,
      });

      // Assert
      expect(result.status).toBe(BetStatus.PENDING);
      expect(betRepository.update.callCount).toBe(0);
      expect(betRepository.create.callCount).toBe(1);
      expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['BetPlaced']);
      expect(broadcaster.broadcastBetCancelled.callCount).toBe(0);
    });
  });
});
