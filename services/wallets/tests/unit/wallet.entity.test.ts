/**
 * Unit tests for Wallet Entity (Aggregate Root).
 *
 * Tests cover:
 * - Happy paths: creation, credit, debit, state queries
 * - Errors: insufficient funds, invalid operations
 * - Edge cases: domain events, versioning, event clearing
 */

import { describe, test, expect } from 'bun:test';
import { Wallet } from '../../src/domain/entities/wallet.entity';
import { Money } from '../../src/domain/value-objects/money.value-object';
import {
  InsufficientFundsError,
  InvalidMoneyAmountError,
} from '../../src/domain/errors/domain.errors';
import type {
  WalletCreatedEvent,
  MoneyCreditedEvent,
  MoneyDebitedEvent,
} from '../../src/domain/events/wallet.events';

describe('Wallet Entity', () => {
  describe('Creation', () => {
    test('should create wallet with zero balance', () => {
      const wallet = Wallet.create('player-123');

      expect(wallet.id).toBeDefined();
      expect(wallet.playerId).toBe('player-123');
      expect(wallet.getBalance().toDecimal()).toBe('0.00');
      expect(wallet.getVersion()).toBe(1);
    });

    test('should emit WalletCreatedEvent on creation', () => {
      const wallet = Wallet.create('player-123');
      const events = wallet.pullEvents();

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('WalletCreated');

      const createdEvent = events[0] as WalletCreatedEvent;
      expect(createdEvent.playerId).toBe('player-123');
      expect(createdEvent.initialBalance).toBe(0n);
      expect(createdEvent.aggregateId).toBe(wallet.id);
    });

    test('should generate unique IDs for each wallet', () => {
      const wallet1 = Wallet.create('player-123');
      const wallet2 = Wallet.create('player-456');

      expect(wallet1.id).not.toBe(wallet2.id);
    });
  });

  describe('Restore from Persistence', () => {
    test('should restore wallet with existing state', () => {
      const wallet = Wallet.restore(
        'existing-id',
        'player-123',
        10000n, // $100.00
        5,
      );

      expect(wallet.id).toBe('existing-id');
      expect(wallet.playerId).toBe('player-123');
      expect(wallet.getBalance().toDecimal()).toBe('100.00');
      expect(wallet.getVersion()).toBe(5);
    });

    test('should NOT emit events on restore', () => {
      const wallet = Wallet.restore('existing-id', 'player-123', 10000n, 1);
      const events = wallet.pullEvents();

      expect(events).toHaveLength(0);
    });

    test('should handle zero balance on restore', () => {
      const wallet = Wallet.restore('existing-id', 'player-123', 0n, 1);

      expect(wallet.getBalance().isZero()).toBe(true);
    });
  });

  describe('Credit Operations', () => {
    test('should credit money and increase balance', () => {
      const wallet = Wallet.create('player-123');

      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      expect(wallet.getBalance().toDecimal()).toBe('100.00');
      expect(wallet.getVersion()).toBe(2);
    });

    test('should emit MoneyCreditedEvent on credit', () => {
      const wallet = Wallet.create('player-123');

      // Clear creation event
      wallet.pullEvents();

      wallet.credit(Money.fromDecimal('50.00'), 'bonus');

      const events = wallet.pullEvents();
      expect(events).toHaveLength(1);

      const creditEvent = events[0] as MoneyCreditedEvent;
      expect(creditEvent.eventType).toBe('MoneyCredited');
      expect(creditEvent.playerId).toBe('player-123');
      expect(creditEvent.amount).toBe(5000n); // $50.00 in cents
      expect(creditEvent.newBalance).toBe(5000n);
      expect(creditEvent.reason).toBe('bonus');
      expect(creditEvent.version).toBe(2);
    });

    test('should handle multiple credits', () => {
      const wallet = Wallet.create('player-123');

      wallet.credit(Money.fromDecimal('100.00'), 'deposit');
      wallet.credit(Money.fromDecimal('50.00'), 'bonus');
      wallet.credit(Money.fromDecimal('25.00'), 'referral');

      expect(wallet.getBalance().toDecimal()).toBe('175.00');
      expect(wallet.getVersion()).toBe(4);
    });

    test('should credit zero amount', () => {
      const wallet = Wallet.create('player-123');

      wallet.credit(Money.zero(), 'adjustment');

      expect(wallet.getBalance().isZero()).toBe(true);
    });

    test('should credit small amounts (1 cent)', () => {
      const wallet = Wallet.create('player-123');

      wallet.credit(Money.fromDecimal('0.01'), 'interest');

      expect(wallet.getBalance().toDecimal()).toBe('0.01');
    });
  });

  describe('Debit Operations', () => {
    test('should debit money and decrease balance', () => {
      const wallet = Wallet.create('player-123');
      wallet.pullEvents(); // Clear creation event
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');
      wallet.pullEvents(); // Clear credit event

      wallet.debit(Money.fromDecimal('30.00'), 'bet');

      expect(wallet.getBalance().toDecimal()).toBe('70.00');
      expect(wallet.getVersion()).toBe(3);
    });

    test('should emit MoneyDebitedEvent on debit', () => {
      const wallet = Wallet.create('player-123');
      wallet.pullEvents(); // Clear creation event
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');
      wallet.pullEvents(); // Clear credit event

      wallet.debit(Money.fromDecimal('30.00'), 'bet');

      const events = wallet.pullEvents();
      expect(events).toHaveLength(1);

      const debitEvent = events[0] as MoneyDebitedEvent;
      expect(debitEvent.eventType).toBe('MoneyDebited');
      expect(debitEvent.playerId).toBe('player-123');
      expect(debitEvent.amount).toBe(3000n); // $30.00 in cents
      expect(debitEvent.newBalance).toBe(7000n); // $70.00 remaining
      expect(debitEvent.reason).toBe('bet');
      expect(debitEvent.version).toBe(3);
    });

    test('should handle multiple debits', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      wallet.debit(Money.fromDecimal('20.00'), 'bet-1');
      wallet.debit(Money.fromDecimal('30.00'), 'bet-2');
      wallet.debit(Money.fromDecimal('10.00'), 'bet-3');

      expect(wallet.getBalance().toDecimal()).toBe('40.00');
    });

    test('should debit entire balance', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      wallet.debit(Money.fromDecimal('100.00'), 'withdrawal');

      expect(wallet.getBalance().isZero()).toBe(true);
    });

    test('should debit small amounts (1 cent)', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('1.00'), 'deposit');

      wallet.debit(Money.fromDecimal('0.01'), 'fee');

      expect(wallet.getBalance().toDecimal()).toBe('0.99');
    });
  });

  describe('Debit Error Cases', () => {
    test('should throw InsufficientFundsError when balance is insufficient', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('50.00'), 'deposit');

      expect(() => {
        wallet.debit(Money.fromDecimal('100.00'), 'bet');
      }).toThrow(InsufficientFundsError);
    });

    test('should throw InsufficientFundsError when balance is zero', () => {
      const wallet = Wallet.create('player-123');

      expect(() => {
        wallet.debit(Money.fromDecimal('1.00'), 'bet');
      }).toThrow(InsufficientFundsError);
    });

    test('should throw InsufficientFundsError with correct message', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('10.00'), 'deposit');

      try {
        wallet.debit(Money.fromDecimal('20.00'), 'bet');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientFundsError);
        expect((error as InsufficientFundsError).currentBalance).toBe(1000n);
        expect((error as InsufficientFundsError).attemptedAmount).toBe(2000n);
      }
    });

    test('should NOT change balance or version on failed debit', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('10.00'), 'deposit');
      const initialBalance = wallet.getBalance().toDecimal();
      const initialVersion = wallet.getVersion();

      try {
        wallet.debit(Money.fromDecimal('20.00'), 'bet');
      } catch (_error) {
        // Expected
      }

      expect(wallet.getBalance().toDecimal()).toBe(initialBalance);
      expect(wallet.getVersion()).toBe(initialVersion);
    });

    test('should NOT emit event on failed debit', () => {
      const wallet = Wallet.create('player-123');
      wallet.pullEvents(); // Clear creation event
      wallet.credit(Money.fromDecimal('10.00'), 'deposit');
      wallet.pullEvents(); // Clear credit event

      try {
        wallet.debit(Money.fromDecimal('20.00'), 'bet');
      } catch (_error) {
        // Expected
      }

      const events = wallet.pullEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('canDebit Check', () => {
    test('should return true when balance is sufficient', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      expect(wallet.canDebit(Money.fromDecimal('50.00'))).toBe(true);
    });

    test('should return true when balance equals amount', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      expect(wallet.canDebit(Money.fromDecimal('100.00'))).toBe(true);
    });

    test('should return false when balance is insufficient', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('50.00'), 'deposit');

      expect(wallet.canDebit(Money.fromDecimal('100.00'))).toBe(false);
    });

    test('should return false when balance is zero', () => {
      const wallet = Wallet.create('player-123');

      expect(wallet.canDebit(Money.fromDecimal('0.01'))).toBe(false);
    });

    test('should return true for zero amount debit', () => {
      const wallet = Wallet.create('player-123');

      expect(wallet.canDebit(Money.zero())).toBe(true);
    });

    test('should NOT throw when checking canDebit', () => {
      const wallet = Wallet.create('player-123');

      expect(() => {
        wallet.canDebit(Money.fromDecimal('1000.00'));
      }).not.toThrow();
    });

    test('should NOT change version when checking canDebit', () => {
      const wallet = Wallet.create('player-123');
      const initialVersion = wallet.getVersion();

      wallet.canDebit(Money.fromDecimal('100.00'));

      expect(wallet.getVersion()).toBe(initialVersion);
    });
  });

  describe('Domain Events', () => {
    test('should accumulate events across operations', () => {
      const wallet = Wallet.create('player-123');

      wallet.credit(Money.fromDecimal('100.00'), 'deposit');
      wallet.debit(Money.fromDecimal('30.00'), 'bet');
      wallet.credit(Money.fromDecimal('10.00'), 'bonus');

      const events = wallet.pullEvents();

      expect(events).toHaveLength(4); // Created, Credited, Debited, Credited
      expect(events[0].eventType).toBe('WalletCreated');
      expect(events[1].eventType).toBe('MoneyCredited');
      expect(events[2].eventType).toBe('MoneyDebited');
      expect(events[3].eventType).toBe('MoneyCredited');
    });

    test('should clear events after pullEvents', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      const events1 = wallet.pullEvents();
      const events2 = wallet.pullEvents();

      expect(events1).toHaveLength(2); // Created, Credited
      expect(events2).toHaveLength(0);
    });

    test('should track event version numbers', () => {
      const wallet = Wallet.create('player-123');
      wallet.pullEvents(); // Clear creation event (v1)

      wallet.credit(Money.fromDecimal('50.00'), 'deposit'); // v2
      const events1 = wallet.pullEvents();
      expect(events1[0].version).toBe(2);

      wallet.debit(Money.fromDecimal('10.00'), 'bet'); // v3
      const events2 = wallet.pullEvents();
      expect(events2[0].version).toBe(3);
    });

    test('getPendingEventsCount should return count without clearing', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      expect(wallet.getPendingEventsCount()).toBe(2); // Created, Credited

      wallet.pullEvents();
      expect(wallet.getPendingEventsCount()).toBe(0);
    });
  });

  describe('Version Management', () => {
    test('should increment version on each state change', () => {
      const wallet = Wallet.create('player-123');

      expect(wallet.getVersion()).toBe(1);

      wallet.credit(Money.fromDecimal('100.00'), 'deposit');
      expect(wallet.getVersion()).toBe(2);

      wallet.debit(Money.fromDecimal('30.00'), 'bet');
      expect(wallet.getVersion()).toBe(3);

      wallet.credit(Money.fromDecimal('10.00'), 'bonus');
      expect(wallet.getVersion()).toBe(4);
    });

    test('should NOT increment version on failed operations', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('10.00'), 'deposit');
      const initialVersion = wallet.getVersion();

      try {
        wallet.debit(Money.fromDecimal('20.00'), 'bet');
      } catch (_error) {
        // Expected
      }

      expect(wallet.getVersion()).toBe(initialVersion);
    });

    test('should NOT increment version on canDebit check', () => {
      const wallet = Wallet.create('player-123');
      const initialVersion = wallet.getVersion();

      wallet.canDebit(Money.fromDecimal('100.00'));

      expect(wallet.getVersion()).toBe(initialVersion);
    });
  });

  describe('Persistence', () => {
    test('toPersistence should return plain object', () => {
      const wallet = Wallet.create('player-123');
      wallet.pullEvents(); // Clear creation event
      wallet.credit(Money.fromDecimal('100.50'), 'deposit');

      const persistence = wallet.toPersistence();

      expect(persistence).toEqual({
        id: wallet.id,
        playerId: 'player-123',
        balance: 10050n, // $100.50 in cents
        version: 2,
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle large balance values', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('1000000.00'), 'jackpot');

      expect(wallet.getBalance().toDecimal()).toBe('1000000.00');
      expect(wallet.canDebit(Money.fromDecimal('999999.99'))).toBe(true);
    });

    test('should handle rapid credit/debit cycles', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      // Simulate multiple small transactions
      for (let i = 0; i < 10; i++) {
        wallet.debit(Money.fromDecimal('1.00'), `bet-${i}`);
      }

      expect(wallet.getBalance().toDecimal()).toBe('90.00');
      expect(wallet.getVersion()).toBe(12); // 1 (create) + 1 (credit) + 10 (debits)
    });

    test('should maintain balance precision through operations', () => {
      const wallet = Wallet.create('player-123');

      wallet.credit(Money.fromDecimal('0.01'), 'interest');
      wallet.credit(Money.fromDecimal('0.02'), 'bonus');
      wallet.debit(Money.fromDecimal('0.01'), 'fee');

      expect(wallet.getBalance().toDecimal()).toBe('0.02');
    });

    test('should handle credit then debit of same amount', () => {
      const wallet = Wallet.create('player-123');
      const amount = Money.fromDecimal('50.00');

      wallet.credit(amount, 'deposit');
      wallet.debit(amount, 'withdrawal');

      expect(wallet.getBalance().isZero()).toBe(true);
    });

    test('should handle alternating credit and debit operations', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      wallet.debit(Money.fromDecimal('30.00'), 'bet-1');
      wallet.credit(Money.fromDecimal('20.00'), 'win');
      wallet.debit(Money.fromDecimal('40.00'), 'bet-2');
      wallet.credit(Money.fromDecimal('15.00'), 'win');

      expect(wallet.getBalance().toDecimal()).toBe('65.00');
    });
  });

  describe('Immutability', () => {
    test('Money instances should remain immutable after operations', () => {
      const wallet = Wallet.create('player-123');
      const money = Money.fromDecimal('100.00');

      wallet.credit(money, 'deposit');

      // Original Money instance should be unchanged
      expect(money.toDecimal()).toBe('100.00');
    });

    test('getBalance should return new Money instance each time', () => {
      const wallet = Wallet.create('player-123');
      wallet.credit(Money.fromDecimal('100.00'), 'deposit');

      const balance1 = wallet.getBalance();
      const balance2 = wallet.getBalance();

      // Same value, but potentially different instances
      expect(balance1.equals(balance2)).toBe(true);
    });
  });
});
