/**
 * Wallet Entity - Aggregate Root for the Wallet bounded context.
 *
 * Manages a player's wallet with balance operations.
 * Enforces the invariant: balance can NEVER be negative.
 *
 * Uses event sourcing pattern - all state changes emit domain events.
 */

import { Money } from '@crash/domain';
import {
  WalletDomainEvent,
  createWalletCreatedEvent,
  createMoneyCreditedEvent,
  createMoneyDebitedEvent,
} from '../events/wallet.events';
import { InsufficientFundsError } from '../errors/domain.errors';

export class Wallet {
  readonly id: string;
  readonly playerId: string;
  private balance: Money;
  private version: number;
  private events: WalletDomainEvent[];

  private constructor(
    id: string,
    playerId: string,
    balance: Money,
    version: number,
  ) {
    this.id = id;
    this.playerId = playerId;
    this.balance = balance;
    this.version = version;
    this.events = [];
  }

  /**
   * Factory method to create a new wallet for a player.
   * Initial balance is zero.
   * Emits WalletCreatedEvent.
   */
  static create(playerId: string): Wallet {
    const walletId = crypto.randomUUID();
    const wallet = new Wallet(walletId, playerId, Money.zero(), 1);
    wallet.addEvent(
      createWalletCreatedEvent(walletId, playerId, Money.zero().toCents(), 1),
    );
    return wallet;
  }

  /**
   * Factory method to restore a wallet from persistence.
   * Does NOT emit events (used for rehydration).
   */
  static restore(
    id: string,
    playerId: string,
    balanceCents: bigint,
    version: number,
  ): Wallet {
    const balance = Money.fromCents(balanceCents);
    const wallet = new Wallet(id, playerId, balance, version);
    return wallet;
  }

  /**
   * Credit money to the wallet.
   * Always succeeds, emits MoneyCreditedEvent.
   */
  credit(amount: Money, reason: string): void {
    this.version++;
    this.balance = this.balance.add(amount);

    this.addEvent(
      createMoneyCreditedEvent(
        this.id,
        this.playerId,
        amount.toCents(),
        this.balance.toCents(),
        reason,
        this.version,
      ),
    );
  }

  /**
   * Debit money from the wallet.
   * Throws InsufficientFundsError if balance is insufficient.
   * Emits MoneyDebitedEvent on success.
   */
  debit(amount: Money, reason: string): void {
    if (!this.canDebit(amount)) {
      throw new InsufficientFundsError(this.balance.toCents(), amount.toCents());
    }

    this.version++;
    this.balance = this.balance.subtract(amount);

    this.addEvent(
      createMoneyDebitedEvent(
        this.id,
        this.playerId,
        amount.toCents(),
        this.balance.toCents(),
        reason,
        this.version,
      ),
    );
  }

  /**
   * Check if wallet has sufficient balance for a debit.
   * Returns boolean without throwing.
   */
  canDebit(amount: Money): boolean {
    return this.balance.isGreaterThan(amount) || this.balance.equals(amount);
  }

  /**
   * Get current balance.
   */
  getBalance(): Money {
    return this.balance;
  }

  /**
   * Get current version for optimistic locking.
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Pull all pending domain events and clear the internal buffer.
   * Used by infrastructure to publish events to message broker.
   */
  pullEvents(): WalletDomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  /**
   * Get count of pending events without clearing.
   */
  getPendingEventsCount(): number {
    return this.events.length;
  }

  /**
   * Add a domain event to the internal buffer.
   */
  private addEvent(event: WalletDomainEvent): void {
    this.events.push(event);
  }

  /**
   * Convert wallet to plain object for persistence.
   */
  toPersistence() {
    return {
      id: this.id,
      playerId: this.playerId,
      balance: this.balance.toCents(),
      version: this.version,
    };
  }
}
