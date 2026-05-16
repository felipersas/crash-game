/**
 * Unit tests for Bet Entity.
 *
 * Tests cover:
 * - Bet creation
 * - Cash out functionality
 * - Mark as lost
 * - State transitions
 * - Persistence
 */

import { describe, test, expect } from 'bun:test';
import { Bet, BetStatus } from '../../src/domain/entities/bet.entity';
import { InvalidAutoCashOutMultiplierError } from '../../src/domain/errors/domain.errors';
import { Money, RoundId, PlayerId } from '@crash/domain';
import { Multiplier } from '../../src/domain/value-objects/multiplier.value-object';

describe('Bet Entity', () => {
  const roundId = RoundId.from('round-123');
  const playerId = PlayerId.from('player-456');
  const playerName = 'Player 456';

  describe('Creation', () => {
    test('should create bet with valid parameters', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      expect(bet.id).toBeDefined();
      expect(bet.roundId).toBe(roundId);
      expect(bet.playerId).toBe(playerId);
      expect(bet.getAmount().toCents()).toBe(1000n);
      expect(bet.getStatus()).toBe(BetStatus.PENDING);
      expect(bet.getCashOutMultiplier()).toBeNull();
      expect(bet.getCashOutAmount()).toBeNull();
      expect(bet.getCashedOutAt()).toBeNull();
    });

    test('should generate unique bet IDs', () => {
      const amount = Money.fromDecimal('10.00');
      const bet1 = Bet.create(roundId, playerId, playerName, amount);
      const bet2 = Bet.create(roundId, playerId, playerName, amount);

      expect(bet1.id).not.toBe(bet2.id);
    });
  });

  describe('Restoration from Persistence', () => {
    test('should restore bet from persistence data', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm(); // Must confirm before cash out
      bet.cashOut(Multiplier.fromValue(2.5));

      const persistenceData = bet.toPersistence();
      const restored = Bet.restore(
        persistenceData.id,
        persistenceData.roundId,
        persistenceData.playerId,
        persistenceData.playerName,
        persistenceData.amountCents,
        persistenceData.status,
        persistenceData.autoCashOutMultiplier,
        persistenceData.cashOutMultiplier,
        persistenceData.cashOutAmount,
        persistenceData.cashedOutAt,
      );

      expect(restored.id).toBe(bet.id);
      expect(restored.roundId).toBe(roundId);
      expect(restored.playerId).toBe(playerId);
      expect(restored.getStatus()).toBe(BetStatus.CASHED_OUT);
      expect(restored.getCashOutMultiplier()?.getValue()).toBe(2.5);
      expect(restored.getCashOutAmount()?.toCents()).toBe(2500n);
    });

    test('should restore lost bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.markAsLost();

      const persistenceData = bet.toPersistence();
      const restored = Bet.restore(
        persistenceData.id,
        persistenceData.roundId,
        persistenceData.playerId,
        persistenceData.playerName,
        persistenceData.amountCents,
        persistenceData.status,
        persistenceData.autoCashOutMultiplier,
        persistenceData.cashOutMultiplier,
        persistenceData.cashOutAmount,
        persistenceData.cashedOutAt,
      );

      expect(restored.getStatus()).toBe(BetStatus.LOST);
    });
  });

  describe('Cash Out', () => {
    test('should cash out active bet and calculate payout correctly', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm(); // First confirm the bet
      const multiplier = Multiplier.fromValue(2.5);

      const payout = bet.cashOut(multiplier);

      expect(payout.toCents()).toBe(2500n); // 10.00 * 2.5 = 25.00
      expect(bet.getStatus()).toBe(BetStatus.CASHED_OUT);
      expect(bet.getCashOutMultiplier()?.getValue()).toBe(2.5);
      expect(bet.getCashOutAmount()?.toCents()).toBe(2500n);
      expect(bet.getCashedOutAt()).toBeInstanceOf(Date);
    });

    test('should cash out at 1.00x', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      const multiplier = Multiplier.fromValue(1.0);

      const payout = bet.cashOut(multiplier);

      expect(payout.toCents()).toBe(1000n); // 10.00 * 1.0 = 10.00
    });

    test('should cash out at high multiplier', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      const multiplier = Multiplier.fromValue(100);

      const payout = bet.cashOut(multiplier);

      expect(payout.toCents()).toBe(100000n); // 10.00 * 100 = 1000.00
    });

    test('should reject cash out for pending bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      expect(() => bet.cashOut(Multiplier.fromValue(2.5))).toThrow(
        'Cannot cash out a bet in PENDING state',
      );
    });

    test('should reject cash out for already cashed out bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      const multiplier = Multiplier.fromValue(2.5);

      bet.cashOut(multiplier);

      expect(() => bet.cashOut(Multiplier.fromValue(3.0))).toThrow(
        'Cannot cash out a bet in CASHED_OUT state',
      );
    });

    test('should reject cash out for lost bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.markAsLost();

      expect(() => bet.cashOut(Multiplier.fromValue(2.5))).toThrow(
        'Cannot cash out a bet in LOST state',
      );
    });
  });

  describe('Mark as Lost', () => {
    test('should mark active bet as lost', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();

      bet.markAsLost();

      expect(bet.getStatus()).toBe(BetStatus.LOST);
      expect(bet.getCashOutAmount()).toBeNull();
    });

    test('should mark pending bet as lost (implicit cancellation)', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      bet.markAsLost();

      expect(bet.getStatus()).toBe(BetStatus.LOST);
    });

    test('should reject marking cashed out bet as lost', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.cashOut(Multiplier.fromValue(2.5));

      expect(() => bet.markAsLost()).toThrow('Cannot mark as lost a bet in CASHED_OUT state');
    });

    test('should reject marking already lost bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.markAsLost();

      expect(() => bet.markAsLost()).toThrow('Cannot mark as lost a bet in LOST state');
    });
  });

  describe('State Checks', () => {
    test('should correctly identify pending bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      expect(bet.isPending()).toBe(true);
      expect(bet.isActive()).toBe(false);
      expect(bet.isCashedOut()).toBe(false);
      expect(bet.isLost()).toBe(false);
    });

    test('should correctly identify confirmed (active) bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();

      expect(bet.isPending()).toBe(false);
      expect(bet.isActive()).toBe(true);
      expect(bet.isCashedOut()).toBe(false);
      expect(bet.isLost()).toBe(false);
    });

    test('should correctly identify cashed out bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.cashOut(Multiplier.fromValue(2.5));

      expect(bet.isPending()).toBe(false);
      expect(bet.isActive()).toBe(false);
      expect(bet.isCashedOut()).toBe(true);
      expect(bet.isLost()).toBe(false);
    });

    test('should correctly identify lost bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.markAsLost();

      expect(bet.isPending()).toBe(false);
      expect(bet.isActive()).toBe(false);
      expect(bet.isCashedOut()).toBe(false);
      expect(bet.isLost()).toBe(true);
    });

    test('should correctly identify cancelled bet', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.cancel('Insufficient funds');

      expect(bet.isPending()).toBe(false);
      expect(bet.isCancelled()).toBe(true);
      expect(bet.isActive()).toBe(false);
    });
  });

  describe('Persistence', () => {
    test('should convert active bet to persistence format', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      const data = bet.toPersistence();

      expect(data.id).toBe(bet.id);
      expect(data.roundId).toBe(roundId);
      expect(data.playerId).toBe(playerId);
      expect(data.playerName).toBe(playerName);
      expect(data.amountCents).toBe(1000n);
      expect(data.status).toBe(BetStatus.PENDING);
      expect(data.cashOutMultiplier).toBeNull();
      expect(data.cashOutAmount).toBeNull();
      expect(data.cashedOutAt).toBeNull();
    });

    test('should convert cashed out bet to persistence format', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm(); // Must confirm before cash out
      bet.cashOut(Multiplier.fromValue(2.5));

      const data = bet.toPersistence();

      expect(data.status).toBe(BetStatus.CASHED_OUT);
      expect(data.cashOutMultiplier).toBe(2.5);
      expect(data.cashOutAmount).toBe(2500n);
      expect(data.cashedOutAt).toBeInstanceOf(Date);
    });

    test('should convert lost bet to persistence format', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);
      bet.confirm();
      bet.markAsLost();

      const data = bet.toPersistence();

      expect(data.status).toBe(BetStatus.LOST);
      expect(data.cashOutMultiplier).toBeNull();
      expect(data.cashOutAmount).toBeNull();
    });
  });

  describe('Getters', () => {
    test('should return correct bet amount', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      expect(bet.getAmount().toCents()).toBe(1000n);
    });

    test('should return correct status', () => {
      const amount = Money.fromDecimal('10.00');
      const bet = Bet.create(roundId, playerId, playerName, amount);

      expect(bet.getStatus()).toBe(BetStatus.PENDING);
    });
  });

  describe('Bet auto cash-out multiplier', () => {
    test('should create bet with autoCashOutMultiplier', () => {
      const bet = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n), 2.5);
      expect(bet.getAutoCashOutMultiplier()).toBe(2.5);
    });

    test('should create bet without autoCashOutMultiplier', () => {
      const bet = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n));
      expect(bet.getAutoCashOutMultiplier()).toBeNull();
    });

    test('should throw InvalidAutoCashOutMultiplierError if autoCashOutMultiplier is below 1.01', () => {
      expect(() => {
        Bet.create(roundId, playerId, playerName, Money.fromCents(1000n), 1.0);
      }).toThrow(InvalidAutoCashOutMultiplierError);
    });

    test('should throw InvalidAutoCashOutMultiplierError if autoCashOutMultiplier exceeds 1000', () => {
      expect(() => {
        Bet.create(roundId, playerId, playerName, Money.fromCents(1000n), 1001);
      }).toThrow(InvalidAutoCashOutMultiplierError);
    });

    test('should accept autoCashOutMultiplier of exactly 1000', () => {
      const bet = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n), 1000);
      expect(bet.getAutoCashOutMultiplier()).toBe(1000);
    });

    test('should restore bet with autoCashOutMultiplier', () => {
      const bet = Bet.restore(
        'bet-1' as any,
        'round-1' as any,
        'player-1' as any,
        'Player',
        1000n,
        BetStatus.ACTIVE,
        2.5,
        null,
        null,
        null,
      );
      expect(bet.getAutoCashOutMultiplier()).toBe(2.5);
    });

    test('should include autoCashOutMultiplier in toPersistence', () => {
      const bet = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n), 3.0);
      const persisted = bet.toPersistence();
      expect(persisted.autoCashOutMultiplier).toBe(3.0);
    });

    test('should return null autoCashOutMultiplier in toPersistence when not set', () => {
      const bet = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n));
      const persisted = bet.toPersistence();
      expect(persisted.autoCashOutMultiplier).toBeNull();
    });

    test('hasAutoCashOut should return correct boolean', () => {
      const withAuto = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n), 2.5);
      const withoutAuto = Bet.create(roundId, playerId, playerName, Money.fromCents(1000n));
      expect(withAuto.hasAutoCashOut()).toBe(true);
      expect(withoutAuto.hasAutoCashOut()).toBe(false);
    });
  });
});
